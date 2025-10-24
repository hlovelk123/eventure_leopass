import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { UsersService } from '../../../users/users.service.js';
import { EmailService } from '../../services/email.service.js';
import { OtpService } from '../../services/otp.service.js';
import { SessionService } from '../../services/session.service.js';
import { AuthService } from '../../services/auth.service.js';
import type { WebauthnService } from '../../services/webauthn.service.js';

class StubEmailService {
  public lastCode?: string;

  async sendOtpEmail(recipient: string, code: string): Promise<void> {
    this.lastCode = code;
    await Promise.resolve();
  }
}

class StubResponse {
  public cookieHeader?: string;

  setHeader(name: string, value: string): void {
    if (name.toLowerCase() === 'set-cookie') {
      this.cookieHeader = value;
    }
  }
}

class StubWebauthnService implements Partial<WebauthnService> {}

describe('AuthService.verifyOtp', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let otpService: OtpService;
  let usersService: UsersService;
  let sessionService: SessionService;
  const emailStub = new StubEmailService();
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/leopass?schema=public';
    const configService = new ConfigService();
    prisma = new PrismaService(configService);
    await prisma.onModuleInit();
    otpService = new OtpService(prisma, emailStub as unknown as EmailService);
    usersService = new UsersService(prisma);
    sessionService = new SessionService(prisma, configService);
    authService = new AuthService(
      usersService,
      otpService,
      sessionService,
      new StubWebauthnService() as WebauthnService,
      prisma
    );
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
        tx.authSession.deleteMany({ where: { userId: { in: createdUserIds } } })
      );
      await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
        tx.emailOtpChallenge.deleteMany({ where: { userId: { in: createdUserIds } } })
      );
      await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
        tx.user.deleteMany({ where: { id: { in: createdUserIds } } })
      );
    }
    await prisma.onModuleDestroy();
  });

  it('creates a session when OTP belongs to the email owner', async () => {
    const email = `auth-otp-${randomUUID()}@example.com`;
    const user = await usersService.getOrCreateInvitedUser(email, 'Auth OTP Tester');
    createdUserIds.push(user.id);

    const { challengeId } = await otpService.requestOtp(user.id, OtpPurpose.SIGN_IN, user.email);
    const stubResponse = new StubResponse();

    const result = await authService.verifyOtp({
      email: user.email,
      challengeId,
      code: emailStub.lastCode!,
      response: stubResponse as unknown as Response
    });

    expect(result.id).toBe(user.id);
    expect(stubResponse.cookieHeader).toContain('lp_session=');
  });

  it('rejects OTP reuse against a different email address', async () => {
    const attackerEmail = `attacker-${randomUUID()}@example.com`;
    const victimEmail = `victim-${randomUUID()}@example.com`;
    const attacker = await usersService.getOrCreateInvitedUser(attackerEmail, 'Attacker');
    const victim = await usersService.getOrCreateInvitedUser(victimEmail, 'Victim');
    createdUserIds.push(attacker.id, victim.id);

    const { challengeId } = await otpService.requestOtp(attacker.id, OtpPurpose.SIGN_IN, attacker.email);
    const stubResponse = new StubResponse();

    await expect(
      authService.verifyOtp({
        email: victim.email,
        challengeId,
        code: emailStub.lastCode!,
        response: stubResponse as unknown as Response
      })
    ).rejects.toThrow(UnauthorizedException);
    expect(stubResponse.cookieHeader).toBeUndefined();
  });
});
