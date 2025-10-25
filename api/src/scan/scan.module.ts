import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { TokensModule } from '../tokens/tokens.module.js';
import { ScanController } from './controllers/scan.controller.js';
import { ScanService } from './services/scan.service.js';

@Module({
  imports: [PrismaModule, AuthModule, TokensModule],
  controllers: [ScanController],
  providers: [ScanService]
})
export class ScanModule {}
