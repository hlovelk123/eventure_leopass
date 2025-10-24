import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON
} from '@simplewebauthn/types';
import { OtpPurpose, User } from '@prisma/client';
import type { Response } from 'express';
import { UsersService } from '../../users/users.service.js';
import { OtpService } from './otp.service.js';
import { SessionService } from './session.service.js';
import { WebauthnService } from './webauthn.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly otpService: OtpService,
    private readonly sessionService: SessionService,
    private readonly webauthnService: WebauthnService,
    private readonly prisma: PrismaService
  ) {}

  async requestOtp(email: string, turnstileToken?: string): Promise<{ challengeId: string; user: User }> {
    const displayName = email.split('@')[0];
    const user = await this.usersService.getOrCreateInvitedUser(email, displayName);
    const { challengeId } = await this.otpService.requestOtp(user.id, OtpPurpose.SIGN_IN, user.email, turnstileToken);
    return { challengeId, user };
  }

  async verifyOtp(params: { email: string; challengeId: string; code: string; response: Response }): Promise<User> {
    const user = await this.usersService.findByEmail(params.email.toLowerCase());
    if (!user) {
      throw new BadRequestException('Account not found');
    }

    const verification = await this.otpService.verifyOtp(params.challengeId, params.code);
    if (verification.challenge.userId !== user.id || verification.challenge.purpose !== OtpPurpose.SIGN_IN) {
      throw new UnauthorizedException('Verification challenge mismatch');
    }

    await this.sessionService.createSession(user, params.response);
    await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE' }
      })
    );
    return user;
  }

  async generatePasskeyRegistrationOptions(user: User): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }> {
    return this.webauthnService.generateRegistrationOptions(user);
  }

  async verifyPasskeyRegistration(user: User, response: RegistrationResponseJSON, challengeId: string): Promise<void> {
    await this.webauthnService.verifyRegistrationResponse({ user, response, challengeId });
  }

  async generatePasskeyAuthenticationOptions(email: string): Promise<{ user: User; options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }> {
    const user = await this.usersService.findByEmail(email.toLowerCase());
    if (!user) {
      throw new UnauthorizedException('Account not found');
    }
    const { options, challengeId } = await this.webauthnService.generateAuthenticationOptions(user);
    return { user, options, challengeId };
  }

  async verifyPasskeyAuthentication(params: {
    user: User;
    response: AuthenticationResponseJSON;
    challengeId: string;
    expressResponse: Response;
  }): Promise<void> {
    await this.webauthnService.verifyAuthenticationResponse({ user: params.user, response: params.response, challengeId: params.challengeId });
    await this.sessionService.createSession(params.user, params.expressResponse);
  }
}
