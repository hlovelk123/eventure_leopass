import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { TokenSigningService } from './token-signing.service.js';
import { ScanTokenService } from './scan-token.service.js';
import { MemberTokenController } from './controllers/member-token.controller.js';
import { JwksController } from './controllers/jwks.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [TokenSigningService, ScanTokenService],
  controllers: [MemberTokenController, JwksController],
  exports: [TokenSigningService, ScanTokenService]
})
export class TokensModule {}
