import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SessionService } from '../../auth/services/session.service.js';
import { ScanService } from '../services/scan.service.js';
import { ScanRequestDto } from '../dto/scan-request.dto.js';

@Controller('scan')
export class ScanController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly scanService: ScanService
  ) {}

  @Post()
  @Throttle({ default: { limit: 150, ttl: 60 } })
  async processScan(
    @Req() req: Request,
    @Body() body: ScanRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string
  ) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    const scannedAt = body.scannedAt ? new Date(body.scannedAt) : undefined;

    const result = await this.scanService.processMemberScan({
      token: body.token,
      idempotencyKey: idempotencyKey ?? null,
      scannerUserId: user.id,
      scannerDeviceId: body.scannerDeviceId ?? null,
      scannedAt: scannedAt ?? null
    });

    return {
      action: result.action,
      attendanceSession: result.session,
      tokenExpiresAt: result.tokenExpiresAt
    };
  }
}
