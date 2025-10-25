import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TokenSigningService } from '../token-signing.service.js';

describe('TokenSigningService', () => {
  let prisma: PrismaService;
  let service: TokenSigningService;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/leopass?schema=public';
    const configService = new ConfigService();
    prisma = new PrismaService(configService);
    await prisma.onModuleInit();
    service = new TokenSigningService(prisma);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('signs and verifies payloads with active key', async () => {
    const payload = { foo: 'bar', jti: 'test', type: 'member' };
    const { token, kid } = await service.sign(payload);
    expect(token).toContain('.');
    expect(kid).toBeDefined();

    const verification = await service.verify<typeof payload>(token);
    expect(verification.payload).toMatchObject(payload);
    expect(verification.header.kid).toBe(kid);
  });

  it('lists public keys in JWKS format', async () => {
    const keys = await service.listPublicKeys();
    expect(keys.length).toBeGreaterThan(0);
    expect(keys[0]).toHaveProperty('kid');
    expect(keys[0]).toHaveProperty('x');
  });
});
