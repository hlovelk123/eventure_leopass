import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TokensModule } from './tokens/tokens.module.js';
import { ScanModule } from './scan/scan.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      validate: validateEnv
    }),
    PrismaModule,
    AuthModule,
    TokensModule,
    ScanModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
