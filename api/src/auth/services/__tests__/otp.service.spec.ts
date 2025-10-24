import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { OtpService } from '../../services/otp.service.js';
import { UsersService } from '../../../users/users.service.js';
import type { EmailService } from '../../services/email.service.js';

class StubEmailService {
  public lastCode?: string;

  async sendOtpEmail(recipient: string, code: string): Promise<void> {
    this.lastCode = code;
    await Promise.resolve();
  }
}

describe('OtpService', () => {
  let prisma: PrismaService;
  let otpService: OtpService;
  let usersService: UsersService;
  const emailStub = new StubEmailService();
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/leopass?schema=public';
    const configService = new ConfigService();
    prisma = new PrismaService(configService);
    await prisma.onModuleInit();
    otpService = new OtpService(prisma, emailStub as unknown as EmailService, configService);
    usersService = new UsersService(prisma);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
        tx.emailOtpChallenge.deleteMany({ where: { userId: { in: createdUserIds } } })
      );
      await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
        tx.user.deleteMany({ where: { id: { in: createdUserIds } } })
      );
    }
    await prisma.onModuleDestroy();
  });

  it('issues and verifies OTP codes', async () => {
    const email = `otp-${randomUUID()}@example.com`;
    const user = await usersService.getOrCreateInvitedUser(email, 'OTP Tester');
    createdUserIds.push(user.id);

    const { challengeId } = await otpService.requestOtp(user.id, OtpPurpose.SIGN_IN, user.email);
    expect(challengeId).toBeDefined();
    expect(emailStub.lastCode).toBeDefined();

    const result = await otpService.verifyOtp(challengeId, emailStub.lastCode!);
    expect(result.challenge.status).toBe('VERIFIED');
  });
});
