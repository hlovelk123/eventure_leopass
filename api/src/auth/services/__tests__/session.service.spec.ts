import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { SessionService } from '../../services/session.service.js';
import { UsersService } from '../../../users/users.service.js';
import { randomUUID } from 'crypto';
import type { Response } from 'express';

class StubResponse {
  cookieHeader?: string;

  setHeader(name: string, value: string) {
    if (name.toLowerCase() === 'set-cookie') {
      this.cookieHeader = value;
    }
  }
}

describe('SessionService', () => {
  let prisma: PrismaService;
  let sessionService: SessionService;
  let usersService: UsersService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/leopass?schema=public';
    const configService = new ConfigService();
    prisma = new PrismaService(configService);
    await prisma.onModuleInit();
    sessionService = new SessionService(prisma, configService);
    usersService = new UsersService(prisma);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
        tx.authSession.deleteMany({ where: { userId: { in: createdUserIds } } })
      );
      await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
        tx.user.deleteMany({ where: { id: { in: createdUserIds } } })
      );
    }
    await prisma.onModuleDestroy();
  });

  it('creates and validates session cookies', async () => {
    const email = `session-${randomUUID()}@example.com`;
    const user = await usersService.getOrCreateInvitedUser(email, 'Session Tester');
    createdUserIds.push(user.id);

    const stub = new StubResponse();
    await sessionService.createSession(user, stub as unknown as Response);

    const { cookieHeader } = stub;
    expect(cookieHeader).toBeDefined();
    if (!cookieHeader) {
      throw new Error('Session cookie missing');
    }

    const { user: validatedUser } = await sessionService.validateFromRequest({ cookie: cookieHeader });
    expect(validatedUser.id).toBe(user.id);
  });
});
