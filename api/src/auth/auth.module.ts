import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../users/users.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';
import { SessionService } from './services/session.service.js';
import { WebauthnService } from './services/webauthn.service.js';
import { OtpService } from './services/otp.service.js';
import { TurnstileService } from './services/turnstile.service.js';
import { EmailService } from './services/email.service.js';

@Module({
  imports: [ConfigModule, PrismaModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService, SessionService, WebauthnService, OtpService, TurnstileService, EmailService],
  exports: [SessionService, AuthService]
})
export class AuthModule {}
