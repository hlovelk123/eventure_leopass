import { ConfigService } from '@nestjs/config';
import { addMinutes } from 'date-fns';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { TokenSigningService } from '../../../tokens/token-signing.service.js';
import { ScanTokenService } from '../../../tokens/scan-token.service.js';
import { ScanService } from '../scan.service.js';

describe('ScanService', () => {
  let prisma: PrismaService;
  let scanService: ScanService;
  let scanTokenService: ScanTokenService;

  const createdIds: {
    stewardId?: string;
    memberId?: string;
    eventId?: string;
    passId?: string;
    scannerDeviceId?: string;
  } = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/leopass?schema=public';
    const configService = new ConfigService();
    prisma = new PrismaService(configService);
    await prisma.onModuleInit();
    const tokenSigningService = new TokenSigningService(prisma);
    scanTokenService = new ScanTokenService(prisma, tokenSigningService);
    scanService = new ScanService(prisma, scanTokenService);

    const now = new Date();
    const [steward, member] = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      Promise.all([
        tx.user.create({
          data: {
            email: `steward-${Date.now()}@example.com`,
            displayName: 'Steward Tester'
          }
        }),
        tx.user.create({
          data: {
            email: `member-${Date.now()}@example.com`,
            displayName: 'Member Tester'
          }
        })
      ])
    );

    createdIds.stewardId = steward.id;
    createdIds.memberId = member.id;

    await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.scannerDevice.deleteMany({
        where: { id: 'device-1' }
      })
    );
    const device = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.scannerDevice.create({
        data: {
          id: 'device-1',
          stewardUserId: steward.id,
          userAgentHash: 'jest-agent'
        }
      })
    );
    createdIds.scannerDeviceId = device.id;

    const event = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.event.create({
        data: {
          name: 'Scan Service Event',
          status: 'ACTIVE',
          mode: 'NO_RSVP',
          startTime: addMinutes(now, -5),
          endTime: addMinutes(now, 60)
        }
      })
    );
    createdIds.eventId = event.id;

    const pass = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.memberEventPass.create({
        data: {
          eventId: event.id,
          userId: member.id
        }
      })
    );
    createdIds.passId = pass.id;
  });

  afterAll(async () => {
    if (createdIds.eventId) {
      await prisma.runWithClaims({ roles: ['system'] }, (tx) => tx.scanToken.deleteMany({ where: { eventId: createdIds.eventId } }));
      await prisma.runWithClaims({ roles: ['system'] }, (tx) => tx.attendanceSession.deleteMany({ where: { eventId: createdIds.eventId } }));
      await prisma.runWithClaims({ roles: ['system'] }, (tx) => tx.memberEventPass.deleteMany({ where: { eventId: createdIds.eventId } }));
      await prisma.runWithClaims({ roles: ['system'] }, (tx) => tx.event.delete({ where: { id: createdIds.eventId! } }));
    }
    if (createdIds.scannerDeviceId) {
      await prisma.runWithClaims({ roles: ['system'] }, (tx) => tx.scannerDevice.delete({ where: { id: createdIds.scannerDeviceId! } }));
    }
    if (createdIds.memberId) {
      await prisma.runWithClaims({ roles: ['system'] }, (tx) => tx.user.delete({ where: { id: createdIds.memberId! } }));
    }
    if (createdIds.stewardId) {
      await prisma.runWithClaims({ roles: ['system'] }, (tx) => tx.user.delete({ where: { id: createdIds.stewardId! } }));
    }
    await prisma.onModuleDestroy();
  });

  it('handles check-in and idempotent retry', async () => {
    const token = await scanTokenService.issueMemberToken({
      userId: createdIds.memberId!,
      eventId: createdIds.eventId!
    });

    const first = await scanService.processMemberScan({
      token: token.token,
      idempotencyKey: 'retry-key',
      scannerUserId: createdIds.stewardId!,
      scannerDeviceId: 'device-1'
    });

    expect(first.action).toBe('check_in');
    expect(first.session.checkInTs).toBeInstanceOf(Date);
    expect(first.session.checkOutTs).toBeNull();

    const retry = await scanService.processMemberScan({
      token: token.token,
      idempotencyKey: 'retry-key',
      scannerUserId: createdIds.stewardId!,
      scannerDeviceId: 'device-1'
    });

    expect(retry.action).toBe('check_in');
    expect(retry.session.id).toBe(first.session.id);
  });

  it('performs check-out on subsequent token', async () => {
    const token = await scanTokenService.issueMemberToken({
      userId: createdIds.memberId!,
      eventId: createdIds.eventId!
    });

    const result = await scanService.processMemberScan({
      token: token.token,
      idempotencyKey: 'checkout-key',
      scannerUserId: createdIds.stewardId!,
      scannerDeviceId: 'device-1'
    });

    expect(result.action).toBe('check_out');
    expect(result.session.checkOutTs).toBeInstanceOf(Date);
  });
});
