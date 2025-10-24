import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthSession, Prisma, User } from '@prisma/client';
import argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import { PrismaService, PrismaClaims } from '../../prisma/prisma.service.js';

const SESSION_COOKIE = 'lp_session';
const SESSION_TTL_HOURS = 24;

export type SessionCookiePayload = {
  sessionId: string;
  sessionToken: string;
};

export type ActiveSession = {
  session: AuthSession;
  user: User;
};

@Injectable()
export class SessionService {
  private readonly cookieDomain?: string;
  private readonly secureCookies: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {
    const appUrl = this.configService.get<string>('APP_URL');
    this.cookieDomain = appUrl ? new URL(appUrl).hostname : undefined;
    this.secureCookies = this.configService.get<'development' | 'test' | 'production'>('NODE_ENV') === 'production';
  }

  createCookieHeader(payload: SessionCookiePayload, maxAgeSeconds: number): string {
    const value = `${payload.sessionId}.${payload.sessionToken}`;
    const parts = [`${SESSION_COOKIE}=${value}`];
    parts.push(`Path=/`);
    parts.push(`HttpOnly`);
    parts.push(`SameSite=Lax`);
    if (this.cookieDomain) {
      parts.push(`Domain=${this.cookieDomain}`);
    }
    if (this.secureCookies) {
      parts.push(`Secure`);
    }
    const expires = maxAgeSeconds > 0 ? new Date(Date.now() + maxAgeSeconds * 1000) : new Date(0);
    parts.push(`Max-Age=${maxAgeSeconds}`);
    parts.push(`Expires=${expires.toUTCString()}`);
    return parts.join('; ');
  }

  clearCookieHeader(): string {
    return this.createCookieHeader({ sessionId: '', sessionToken: '' }, 0);
  }

  async createSession(user: User, response: Response, options?: { credentialId?: string }): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const hashedToken = await argon2.hash(token, { type: argon2.argon2id });
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    const session = await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.authSession.create({
        data: {
          userId: user.id,
          sessionTokenHash: hashedToken,
          webauthnCredentialId: options?.credentialId ?? null,
          expiresAt,
          isActive: true
        }
      })
    );

    response.setHeader('Set-Cookie', this.createCookieHeader({ sessionId: session.id, sessionToken: token }, SESSION_TTL_HOURS * 60 * 60));
  }

  parseCookie(header?: string): SessionCookiePayload | null {
    if (!header) return null;
    const cookies = header.split(';').map((v) => v.trim());
    const cookie = cookies.find((item) => item.startsWith(`${SESSION_COOKIE}=`));
    if (!cookie) return null;
    const [, value] = cookie.split('=');
    if (!value) return null;
    const [sessionId, sessionToken] = value.split('.');
    if (!sessionId || !sessionToken) return null;
    return { sessionId, sessionToken };
  }

  async validateFromRequest(headers: Record<string, string | string[] | undefined>): Promise<ActiveSession> {
    const cookieHeader = headers.cookie;
    const value = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    const parsed = this.parseCookie(value);

    if (!parsed) {
      throw new UnauthorizedException('Session missing');
    }

    return this.validateSession(parsed.sessionId, parsed.sessionToken);
  }

  async validateSession(sessionId: string, sessionToken: string): Promise<ActiveSession> {
    const session = await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.authSession.findUnique({
        where: { id: sessionId },
        include: { user: true }
      })
    );

    if (!session || !session.isActive) {
      throw new UnauthorizedException('Invalid session');
    }

    if (session.expiresAt < new Date()) {
      await this.invalidateSession(session.id);
      throw new UnauthorizedException('Session expired');
    }

    const matches = await argon2.verify(session.sessionTokenHash, sessionToken);
    if (!matches) {
      await this.invalidateSession(session.id);
      throw new UnauthorizedException('Invalid session token');
    }

    await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.authSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() }
      })
    );

    return { session, user: session.user };
  }

  async invalidateSession(sessionId: string): Promise<void> {
    await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.authSession.update({
        where: { id: sessionId },
        data: {
          isActive: false,
          expiresAt: new Date()
        }
      })
    );
  }

  async invalidateAllUserSessions(userId: string): Promise<void> {
    await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.authSession.updateMany({
        where: { userId },
        data: {
          isActive: false,
          expiresAt: new Date()
        }
      })
    );
  }

  async runWithUserContext<T>(
    claims: PrismaClaims,
    callback: (client: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.prisma.runWithClaims(claims, callback);
  }
}
