import { ConfigService } from '@nestjs/config';
import { addMinutes } from 'date-fns';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TokenSigningService } from '../token-signing.service.js';
import { ScanTokenService } from '../scan-token.service.js';

describe('ScanTokenService', () => {
  let prisma: PrismaService;
  let signingService: TokenSigningService;
  let service: ScanTokenService;
  const createdIds: { userId?: string; eventId?: string; passId?: string } = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/leopass?schema=public';
    const configService = new ConfigService();
    prisma = new PrismaService(configService);
    await prisma.onModuleInit();
    signingService = new TokenSigningService(prisma);
    service = new ScanTokenService(prisma, signingService);
  });

  afterAll(async () => {
    await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.scanToken.deleteMany({
        where: { eventId: createdIds.eventId ?? undefined }
      })
    );
    if (createdIds.passId) {
      await prisma.runWithClaims({ roles: ['system'] }, (tx) => tx.memberEventPass.delete({ where: { id: createdIds.passId! } }));
    }
    if (createdIds.eventId) {
      await prisma.runWithClaims({ roles: ['system'] }, (tx) => tx.event.delete({ where: { id: createdIds.eventId! } }));
    }
    if (createdIds.userId) {
      await prisma.runWithClaims({ roles: ['system'] }, (tx) => tx.user.delete({ where: { id: createdIds.userId! } }));
    }
    await prisma.onModuleDestroy();
  });

  it('issues and verifies member tokens', async () => {
    const now = new Date();
    const user = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.user.create({
        data: {
          email: `scan-token-${Date.now()}@example.com`,
          displayName: 'Scan Token User'
        }
      })
    );
    createdIds.userId = user.id;

    const event = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.event.create({
        data: {
          name: 'Scan Token Event',
          status: 'ACTIVE',
          mode: 'NO_RSVP',
          startTime: addMinutes(now, -10),
          endTime: addMinutes(now, 60)
        }
      })
    );
    createdIds.eventId = event.id;

    const pass = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.memberEventPass.create({
        data: {
          eventId: event.id,
          userId: user.id
        }
      })
    );
    createdIds.passId = pass.id;

    const { token, expiresAt } = await service.issueMemberToken({ userId: user.id, eventId: event.id });
    expect(typeof token).toBe('string');
    expect(expiresAt.getTime()).toBeGreaterThan(now.getTime());

    const verification = await service.verifyMemberToken(token);
    expect(verification.payload.eventId).toBe(event.id);
    expect(verification.payload.sub).toBe(user.id);
  });
});
