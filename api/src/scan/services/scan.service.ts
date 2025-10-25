import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { MemberEventPassStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ScanTokenService, MemberTokenPayload } from '../../tokens/scan-token.service.js';

const CLOCK_SKEW_MS = 90 * 1000;

export type ScanAction = 'check_in' | 'check_out';

export type ProcessMemberScanParams = {
  token: string;
  idempotencyKey?: string | null;
  scannerUserId: string;
  scannerDeviceId?: string | null;
  scannedAt?: Date | null;
};

export type ScanResult = {
  action: ScanAction;
  session: {
    id: string;
    eventId: string;
    userId: string | null;
    checkInTs: Date | null;
    checkOutTs: Date | null;
  };
  tokenExpiresAt: Date;
};

@Injectable()
export class ScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scanTokenService: ScanTokenService
  ) {}

  private normalizeIdempotencyKey(key?: string | null): string | null {
    if (!key) {
      return null;
    }
    const trimmed = key.trim();
    return trimmed.length > 0 ? trimmed.toLowerCase() : null;
  }

  private validateScanWindow(event: { startTime: Date; endTime: Date; autoCheckoutGraceMin: number | null }, scanTime: Date) {
    const earliest = new Date(event.startTime.getTime() - CLOCK_SKEW_MS);
    const graceMinutes = event.autoCheckoutGraceMin ?? 5;
    const latest = new Date(event.endTime.getTime() + graceMinutes * 60_000 + CLOCK_SKEW_MS);

    if (scanTime < earliest) {
      throw new BadRequestException('Event has not opened for scans');
    }
    if (scanTime > latest) {
      throw new BadRequestException('Event closed for scans');
    }
  }

  private validateTokenWindow(payload: MemberTokenPayload, scanTime: Date) {
    const nowMs = scanTime.getTime();
    const nbfMs = payload.nbf * 1000;
    const expMs = payload.exp * 1000;

    if (nowMs < nbfMs - CLOCK_SKEW_MS) {
      throw new BadRequestException('Token not yet valid');
    }

    if (nowMs > expMs + CLOCK_SKEW_MS) {
      throw new BadRequestException('Token expired');
    }
  }

  private async ensureIdempotencyKeyUnique(client: Prisma.TransactionClient, key: string, jti: string) {
    const existing = await client.scanToken.findFirst({
      where: {
        consumedIdempotencyKey: key,
        NOT: {
          jti
        }
      }
    });
    if (existing) {
      throw new BadRequestException('Idempotency key already used for another scan');
    }
  }

  async processMemberScan(params: ProcessMemberScanParams): Promise<ScanResult> {
    const scanTime = params.scannedAt ?? new Date();
    if (Number.isNaN(scanTime.getTime())) {
      throw new BadRequestException('Invalid scan timestamp');
    }

    const normalizedKey = this.normalizeIdempotencyKey(params.idempotencyKey);

    return this.prisma.runWithClaims({ roles: ['system'] }, async (tx) => {
      const { payload } = await this.scanTokenService.verifyMemberToken(params.token, tx);
      this.validateTokenWindow(payload, scanTime);

      const scanToken = await tx.scanToken.findUnique({
        where: { jti: payload.jti },
        include: { attendanceSession: true }
      });

      if (!scanToken) {
        throw new UnauthorizedException('Token not recognised');
      }

      if (scanToken.eventId !== payload.eventId) {
        throw new UnauthorizedException('Token event mismatch');
      }

      if (scanToken.userId && scanToken.userId !== payload.sub) {
        throw new UnauthorizedException('Token user mismatch');
      }

      if (scanToken.usedAt) {
        const previousSession = scanToken.attendanceSession;
        if (normalizedKey && scanToken.consumedIdempotencyKey === normalizedKey && previousSession) {
          const action: ScanAction = previousSession.checkOutTs ? 'check_out' : 'check_in';
          return {
            action,
            session: {
              id: previousSession.id,
              eventId: previousSession.eventId,
              userId: previousSession.userId,
              checkInTs: previousSession.checkInTs,
              checkOutTs: previousSession.checkOutTs
            },
            tokenExpiresAt: new Date(payload.exp * 1000)
          };
        }
        throw new BadRequestException('Token already consumed');
      }

      if (normalizedKey) {
        await this.ensureIdempotencyKeyUnique(tx, normalizedKey, scanToken.jti);
      }

      const pass = await tx.memberEventPass.findFirst({
        where: { eventId: payload.eventId, userId: payload.sub },
        include: { event: true }
      });

      if (!pass || !pass.event) {
        throw new UnauthorizedException('Member pass not found');
      }

      if (pass.status === MemberEventPassStatus.REVOKED) {
        throw new BadRequestException('Member pass revoked');
      }

      this.validateScanWindow(
        {
          startTime: pass.event.startTime,
          endTime: pass.event.endTime,
          autoCheckoutGraceMin: pass.event.autoCheckoutGraceMin
        },
        scanTime
      );

      let session = await tx.attendanceSession.findFirst({
        where: {
          eventId: payload.eventId,
          userId: payload.sub,
          checkOutTs: null
        },
        orderBy: { createdAt: 'desc' }
      });

      let action: ScanAction;

      const hasOpenSession = Boolean(session?.checkInTs) && !session?.checkOutTs;

      if (!hasOpenSession || !session) {
        session = await tx.attendanceSession.create({
          data: {
            eventId: payload.eventId,
            userId: payload.sub,
            checkInTs: scanTime,
            method: 'STEWARD',
            scannerDeviceId: params.scannerDeviceId ?? null
          }
        });
        action = 'check_in';

        if (pass.status !== MemberEventPassStatus.ACTIVE || !pass.activatedAt) {
          await tx.memberEventPass.update({
            where: { id: pass.id },
            data: {
              status: MemberEventPassStatus.ACTIVE,
              activatedAt: pass.activatedAt ?? scanTime
            }
          });
        }
      } else {
        session = await tx.attendanceSession.update({
          where: { id: session.id },
          data: {
            checkOutTs: session.checkOutTs ?? scanTime,
            scannerDeviceId: params.scannerDeviceId ?? session?.scannerDeviceId ?? null
          }
        });
        action = 'check_out';
      }

      await tx.scanToken.update({
        where: { jti: payload.jti },
        data: {
          usedAt: scanTime,
          usedByScannerId: params.scannerUserId ?? null,
          attendanceSessionId: session.id,
          ...(normalizedKey ? { consumedIdempotencyKey: normalizedKey } : {})
        }
      });

      return {
        action,
        session: {
          id: session.id,
          eventId: session.eventId,
          userId: session.userId,
          checkInTs: session.checkInTs,
          checkOutTs: session.checkOutTs
        },
        tokenExpiresAt: new Date(payload.exp * 1000)
      };
    });
  }
}
