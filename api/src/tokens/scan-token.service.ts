import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { MemberEventPassStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { addSeconds } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service.js';
import { TokenSigningService } from './token-signing.service.js';

const TOKEN_TTL_SECONDS = 30;

export type MemberTokenPayload = {
  jti: string;
  sub: string;
  eventId: string;
  type: 'member';
  ver: number;
  iat: number;
  nbf: number;
  exp: number;
};

@Injectable()
export class ScanTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenSigningService: TokenSigningService
  ) {}

  private getNow(): Date {
    return new Date();
  }

  private toSeconds(date: Date): number {
    return Math.floor(date.getTime() / 1000);
  }

  async issueMemberToken(params: { userId: string; eventId: string }): Promise<{ token: string; expiresAt: Date }> {
    const now = this.getNow();

    const pass = await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.memberEventPass.findFirst({
        where: {
          eventId: params.eventId,
          userId: params.userId,
          status: { in: [MemberEventPassStatus.PROVISIONED, MemberEventPassStatus.ACTIVE] }
        },
        include: {
          event: true
        }
      })
    );

    if (!pass || !pass.event) {
      throw new NotFoundException('Event pass not found');
    }

    if (pass.status === MemberEventPassStatus.REVOKED) {
      throw new BadRequestException('Pass revoked');
    }

    const jti = randomUUID();
    const payload: MemberTokenPayload = {
      jti,
      sub: params.userId,
      eventId: params.eventId,
      type: 'member',
      ver: 1,
      iat: this.toSeconds(now),
      nbf: this.toSeconds(now),
      exp: this.toSeconds(addSeconds(now, TOKEN_TTL_SECONDS))
    };

    const { token, kid } = await this.tokenSigningService.sign(payload);

    await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.scanToken.create({
        data: {
          jti,
          eventId: params.eventId,
          userId: params.userId,
          issuedAt: now,
          notBefore: now,
          expiresAt: new Date(payload.exp * 1000),
          signatureKid: kid,
          burnType: 'member'
        }
      })
    );

    return { token, expiresAt: new Date(payload.exp * 1000) };
  }

  async verifyMemberToken(
    token: string,
    client?: Prisma.TransactionClient
  ): Promise<{ payload: MemberTokenPayload; keyId: string }> {
    const { payload, header } = await this.tokenSigningService.verify<MemberTokenPayload>(token, client);
    if (payload.type !== 'member') {
      throw new Error('Unsupported token type');
    }

    if (!payload.eventId || !payload.sub || !payload.jti) {
      throw new Error('Invalid token payload');
    }

    return { payload, keyId: header.kid };
  }
}
