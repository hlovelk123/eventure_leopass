import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet, { type HelmetOptions } from 'helmet';
import type { Express } from 'express';
import { AppModule } from './app.module.js';
import { PrismaService } from './prisma/prisma.service.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true }
    })
  );

  const configService = app.get(ConfigService);
  const prismaService = app.get(PrismaService);
  prismaService.enableShutdownHooks(app);

  const appUrl = configService.get<string>('APP_URL');
  const appOrigin = appUrl ? new URL(appUrl).origin : undefined;
  const corsOrigin = appUrl ? [appUrl] : true;

  app.enableCors({
    origin: corsOrigin,
    credentials: true
  });

  const connectSrc: string[] = appOrigin ? ["'self'", appOrigin] : ["'self'"];
  const helmetOptions = {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc,
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
        frameSrc: ["'self'", 'https://challenges.cloudflare.com']
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31_536_000,
      includeSubDomains: true,
      preload: true
    }
  } satisfies HelmetOptions;
  app.use(helmet(helmetOptions));
  app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));

  const httpAdapter = app.getHttpAdapter();
  const expressInstance = httpAdapter.getInstance() as Express;
  expressInstance.set('trust proxy', 1);

  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  const address = await app.getUrl();
  Logger.log(`API listening on ${address}`, 'Bootstrap');
}

void bootstrap();
