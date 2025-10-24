import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { INestApplication } from '@nestjs/common/interfaces';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';

export type PrismaClaims = {
  userId?: string | null;
  clubIds?: string[];
  districtIds?: string[];
  roles?: string[];
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    super({
      log: process.env.NODE_ENV === 'production' ? [] : ['error', 'warn'],
      datasources: {
        db: {
          url: configService.get<string>('DATABASE_URL'),
        },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }

  enableShutdownHooks(app: INestApplication): void {
    (this.$on as (event: 'beforeExit', handler: () => void) => void)('beforeExit', () => {
      void app.close();
    });
  }

  async runWithClaims<T>(claims: PrismaClaims, fn: (client: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT leopass.set_claims(
          ${claims.userId ?? null}::uuid,
          ${claims.clubIds ?? []}::uuid[],
          ${claims.districtIds ?? []}::uuid[],
          ${claims.roles ?? []}::text[]
        )
      `;
      const result = await fn(tx);
      await tx.$executeRaw`SELECT leopass.set_claims(NULL, NULL, NULL, NULL)`;
      return result;
    });
  }
}
