import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createPublicKey, createPrivateKey, generateKeyPairSync, randomUUID, sign, verify as cryptoVerify } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';

type TokenSigningKeyRecord = {
  kid: string;
  publicKey: string;
  privateKey: string;
  status: 'ACTIVE' | 'ROTATING' | 'RETIRED';
  createdAt: Date;
  activatedAt: Date;
  rotatedAt: Date | null;
  expiresAt: Date | null;
};

export type TokenHeader = {
  alg: 'EdDSA';
  typ: 'LPQR';
  kid: string;
};

export type TokenPayload = Record<string, unknown>;

function toBase64Url(value: Buffer | string): string {
  const buffer = typeof value === 'string' ? Buffer.from(value) : value;
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

@Injectable()
export class TokenSigningService {
  private readonly logger = new Logger(TokenSigningService.name);

  constructor(private readonly prisma: PrismaService) {}

  private exportPrivateKeyPem(privateKey: ReturnType<typeof createPrivateKey>): string {
    return privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  }

  private exportPublicKeyPem(publicKey: ReturnType<typeof createPublicKey>): string {
    return publicKey.export({ format: 'pem', type: 'spki' }).toString();
  }

  private extractPublicKeyX(publicKeyPem: string): string {
    const publicKey = createPublicKey(publicKeyPem);
    const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    // Ed25519 SPKI layout ends with 32-byte public key.
    const keyBytes = der.slice(-32);
    return toBase64Url(keyBytes);
  }

  async ensureActiveKey(): Promise<TokenSigningKeyRecord> {
    return this.prisma.runWithClaims<TokenSigningKeyRecord>({ roles: ['system'] }, async (tx) => {
      const existing = (await tx.tokenSigningKey.findFirst({
        where: { status: { in: ['ACTIVE', 'ROTATING'] } },
        orderBy: { activatedAt: 'desc' }
      })) as TokenSigningKeyRecord | null;
      if (existing) {
        return existing;
      }

      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      const publicKeyPem = this.exportPublicKeyPem(publicKey);
      const privateKeyPem = this.exportPrivateKeyPem(privateKey);
      const kid = randomUUID();

      this.logger.log(`Creating new Ed25519 signing key (kid=${kid})`);
      return (await tx.tokenSigningKey.create({
        data: {
          kid,
          publicKey: publicKeyPem,
          privateKey: privateKeyPem,
          status: 'ACTIVE'
        }
      })) as TokenSigningKeyRecord;
    });
  }

  async listPublicKeys(): Promise<{ kid: string; x: string }[]> {
    const keys = await this.prisma.runWithClaims<TokenSigningKeyRecord[]>({ roles: ['system'] }, (tx) =>
      tx.tokenSigningKey.findMany({
        where: { status: { in: ['ACTIVE', 'ROTATING'] } },
        orderBy: { activatedAt: 'desc' }
      })
    );
    return keys.map((key) => ({
      kid: key.kid,
      x: this.extractPublicKeyX(key.publicKey)
    }));
  }

  async sign(payload: TokenPayload): Promise<{ token: string; kid: string }> {
    const activeKey = await this.ensureActiveKey();
    const header: TokenHeader = { alg: 'EdDSA', typ: 'LPQR', kid: activeKey.kid };
    const encodedHeader = toBase64Url(Buffer.from(JSON.stringify(header)));
    const encodedPayload = toBase64Url(Buffer.from(JSON.stringify(payload)));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const privateKey = createPrivateKey(activeKey.privateKey);
    const signature = sign(null, Buffer.from(signingInput), privateKey);
    const encodedSignature = toBase64Url(signature);

    return { token: `${signingInput}.${encodedSignature}`, kid: activeKey.kid };
  }

  async verify<TPayload extends TokenPayload = TokenPayload>(
    token: string,
    client?: Prisma.TransactionClient
  ): Promise<{ header: TokenHeader; payload: TPayload; key: TokenSigningKeyRecord }> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed token');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const headerJson = fromBase64Url(encodedHeader).toString();
    const payloadJson = fromBase64Url(encodedPayload).toString();
    let header: TokenHeader;
    let payload: TPayload;

    try {
      header = JSON.parse(headerJson) as TokenHeader;
    } catch {
      throw new Error('Invalid token header');
    }

    try {
      payload = JSON.parse(payloadJson) as TPayload;
    } catch {
      throw new Error('Invalid token payload');
    }

    if (header.alg !== 'EdDSA' || header.typ !== 'LPQR' || !header.kid) {
      throw new Error('Unsupported token header');
    }

    let key: TokenSigningKeyRecord | null;
    if (client) {
      key = (await client.tokenSigningKey.findFirst({
        where: {
          kid: header.kid,
          status: { in: ['ACTIVE', 'ROTATING', 'RETIRED'] }
        }
      })) as TokenSigningKeyRecord | null;
    } else {
      key = await this.prisma.runWithClaims<TokenSigningKeyRecord | null>({ roles: ['system'] }, (tx) =>
        tx.tokenSigningKey.findFirst({
          where: {
            kid: header.kid,
            status: { in: ['ACTIVE', 'ROTATING', 'RETIRED'] }
          }
        }) as Promise<TokenSigningKeyRecord | null>
      );
    }
    if (!key) {
      throw new Error('Signing key not found');
    }

    const publicKey = createPublicKey(key.publicKey);
    const verified = cryptoVerify(null, Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, fromBase64Url(encodedSignature));
    if (!verified) {
      throw new Error('Invalid token signature');
    }

    return { header, payload, key };
  }
}
