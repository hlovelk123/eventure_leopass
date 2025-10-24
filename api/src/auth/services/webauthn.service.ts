import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/types';
import { User, WebauthnChallenge, WebauthnChallengeType, WebauthnCredential } from '@prisma/client';
import type {
  AuthenticatorTransportFuture,
  WebAuthnCredential as SimpleWebAuthnCredential
} from '@simplewebauthn/server/script/types/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

function toBase64Url(data: ArrayBuffer | Uint8Array): string {
  const buffer = data instanceof Uint8Array ? Buffer.from(data) : Buffer.from(data);
  return buffer.toString('base64url');
}

function toUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const buffer = Buffer.from(base64, 'base64url');
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Uint8Array(arrayBuffer);
}

const AUTHENTICATOR_TRANSPORTS: AuthenticatorTransportFuture[] = ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'];

function mapTransports(values?: string[] | null): AuthenticatorTransportFuture[] | undefined {
  if (!values) {
    return undefined;
  }
  return values.filter((value): value is AuthenticatorTransportFuture =>
    AUTHENTICATOR_TRANSPORTS.includes(value as AuthenticatorTransportFuture)
  );
}

@Injectable()
export class WebauthnService {
  private readonly rpId: string;
  private readonly rpName: string;
  private readonly origin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {
    const appUrl = this.configService.get<string>('APP_URL') ?? 'http://localhost:5173';
    const url = new URL(appUrl);
    this.rpId = url.hostname;
    this.origin = `${url.protocol}//${url.host}`;
    this.rpName = this.configService.get<string>('APP_NAME') ?? 'Leo Pass';
  }

  async generateRegistrationOptions(user: User): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }> {
    const credentials = await this.prisma.runWithClaims<WebauthnCredential[]>(
      { roles: ['system'] },
      (tx) => tx.webauthnCredential.findMany({ where: { userId: user.id } })
    );

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userName: user.email,
      userDisplayName: user.displayName,
      userID: Uint8Array.from(Buffer.from(user.id)),
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred'
      },
      excludeCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: mapTransports(credential.transports)
      }))
    });

    const challenge = await this.saveChallenge({
      challenge: options.challenge,
      type: WebauthnChallengeType.REGISTRATION,
      userId: user.id
    });

    return { options, challengeId: challenge.id };
  }

  async verifyRegistrationResponse(params: {
    user: User;
    response: RegistrationResponseJSON;
    challengeId: string;
  }): Promise<void> {
    const challenge = await this.consumeChallenge(params.challengeId, WebauthnChallengeType.REGISTRATION, params.user.id);

    const verification = await verifyRegistrationResponse({
      response: params.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      requireUserVerification: true
    });

    const registrationInfo = verification.registrationInfo;

    if (!verification.verified || !registrationInfo) {
      throw new BadRequestException('Passkey registration verification failed');
    }

    const { credential, credentialDeviceType } = registrationInfo;
    const { publicKey, id, counter, transports } = credential;

    const storedTransports = mapTransports(transports ?? params.response.response.transports ?? []);

    await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.webauthnCredential.upsert({
        where: { credentialId: id },
        update: {
          publicKey: toBase64Url(publicKey),
          signCount: counter,
          transports: storedTransports ?? [],
          updatedAt: new Date()
        },
        create: {
          credentialId: id,
          userId: params.user.id,
          publicKey: toBase64Url(publicKey),
          signCount: counter,
          transports: storedTransports ?? [],
          deviceLabel: credentialDeviceType ?? null,
          lastUsedAt: new Date()
        }
      })
    );
  }

  async generateAuthenticationOptions(user: User): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }> {
    const credentials = await this.prisma.runWithClaims<WebauthnCredential[]>(
      { roles: ['system'] },
      (tx) => tx.webauthnCredential.findMany({ where: { userId: user.id } })
    );

    if (credentials.length === 0) {
      throw new BadRequestException('No passkeys registered for this account');
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: mapTransports(credential.transports)
      })),
      userVerification: 'preferred'
    });

    const challenge = await this.saveChallenge({
      challenge: options.challenge,
      type: WebauthnChallengeType.AUTHENTICATION,
      userId: user.id
    });

    return { options, challengeId: challenge.id };
  }

  async verifyAuthenticationResponse(params: {
    user: User;
    response: AuthenticationResponseJSON;
    challengeId: string;
  }): Promise<void> {
    const challenge = await this.consumeChallenge(params.challengeId, WebauthnChallengeType.AUTHENTICATION, params.user.id);

    const credentialId = params.response.rawId;

    const credential = await this.prisma.runWithClaims<WebauthnCredential | null>(
      { roles: ['system'] },
      (tx) =>
        tx.webauthnCredential.findUnique({
          where: { credentialId }
        })
    );

    if (!credential) {
      throw new UnauthorizedException('Unknown credential');
    }

    const authenticator: SimpleWebAuthnCredential = {
      id: credential.credentialId,
      publicKey: toUint8Array(credential.publicKey),
      counter: credential.signCount,
      transports: mapTransports(credential.transports)
    };

    const verification = await verifyAuthenticationResponse({
      response: params.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      requireUserVerification: true,
      credential: authenticator
    });

    const authenticationInfo = verification.authenticationInfo as
      | {
          newCounter: number;
        }
      | undefined;

    if (!verification.verified || !authenticationInfo) {
      throw new UnauthorizedException('Passkey verification failed');
    }

    const { newCounter } = authenticationInfo;

    await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.webauthnCredential.update({
        where: { credentialId },
        data: {
          signCount: newCounter,
          lastUsedAt: new Date()
        }
      })
    );
  }

  private async saveChallenge(params: { userId?: string; type: WebauthnChallengeType; challenge: string }) {
    return this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.webauthnChallenge.create({
        data: {
          userId: params.userId ?? null,
          type: params.type,
          challenge: params.challenge,
          expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS)
        }
      })
    );
  }

  private async consumeChallenge(
    challengeId: string,
    type: WebauthnChallengeType,
    userId?: string
  ): Promise<WebauthnChallenge> {
    const challenge = await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.webauthnChallenge.findUnique({ where: { id: challengeId } })
    );

    if (!challenge) {
      throw new BadRequestException('Challenge not found');
    }

    if (challenge.type !== type) {
      throw new BadRequestException('Challenge type mismatch');
    }

    if (challenge.expiresAt < new Date()) {
      throw new BadRequestException('Challenge expired');
    }

    if (userId && challenge.userId && challenge.userId !== userId) {
      throw new UnauthorizedException('Challenge does not belong to this user');
    }

    await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.webauthnChallenge.update({
        where: { id: challengeId },
        data: { consumedAt: new Date() }
      })
    );

    return challenge;
  }
}
