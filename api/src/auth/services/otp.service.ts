import { Injectable, BadRequestException } from '@nestjs/common';
import { EmailOtpChallenge, OtpPurpose } from '@prisma/client';
import argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from './email.service.js';

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export type OtpVerificationResult = {
  challenge: EmailOtpChallenge;
};

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService
  ) {}

  private generateCode(): string {
    return (Math.floor(Math.random() * 900000) + 100000).toString();
  }

  private async hashCode(code: string): Promise<{ hash: string; salt: string }> {
    const saltBuffer = randomBytes(16);
    const hash = await argon2.hash(code, {
      type: argon2.argon2id,
      salt: saltBuffer
    });
    return { hash, salt: saltBuffer.toString('base64') };
  }

  async requestOtp(
    userId: string,
    purpose: OtpPurpose,
    email: string,
    turnstileToken?: string
  ): Promise<{ challengeId: string }> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);
    const code = this.generateCode();
    const { hash, salt } = await this.hashCode(code);

    const challenge = await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.emailOtpChallenge.create({
        data: {
          userId,
          purpose,
          codeHash: hash,
          codeSalt: salt,
          expiresAt,
          status: 'PENDING',
          turnstileToken: turnstileToken ?? null
        }
      })
    );

    await this.emailService.sendOtpEmail(email, code);

    return { challengeId: challenge.id };
  }

  async verifyOtp(challengeId: string, code: string): Promise<OtpVerificationResult> {
    const challenge = await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.emailOtpChallenge.findUnique({ where: { id: challengeId } })
    );

    if (!challenge) {
      throw new BadRequestException('Invalid verification request');
    }

    if (challenge.status !== 'PENDING') {
      throw new BadRequestException('Verification code already used');
    }

    if (challenge.expiresAt < new Date()) {
      await this.markChallengeExpired(challengeId);
      throw new BadRequestException('Verification code expired');
    }

    if (challenge.attempts >= MAX_ATTEMPTS) {
      await this.markChallengeExpired(challengeId);
      throw new BadRequestException('Too many attempts; request a new code');
    }

    const isValid = await argon2.verify(challenge.codeHash, code);

    if (!isValid) {
      await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
        tx.emailOtpChallenge.update({
          where: { id: challengeId },
          data: {
            attempts: { increment: 1 }
          }
        })
      );
      throw new BadRequestException('Invalid verification code');
    }

    const updatedChallenge = await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.emailOtpChallenge.update({
        where: { id: challengeId },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date(),
          consumedAt: new Date()
        }
      })
    );

    return { challenge: updatedChallenge };
  }

  private async markChallengeExpired(challengeId: string): Promise<void> {
    await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.emailOtpChallenge.update({
        where: { id: challengeId },
        data: {
          status: 'EXPIRED',
          updatedAt: new Date()
        }
      })
    );
  }
}
