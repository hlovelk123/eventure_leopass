import { Controller, Get, Param, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SessionService } from '../../auth/services/session.service.js';
import { ScanTokenService } from '../scan-token.service.js';

@Controller('member/events')
export class MemberTokenController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly scanTokenService: ScanTokenService
  ) {}

  @Get(':eventId/token')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  async getMemberToken(@Req() req: Request, @Param('eventId') eventId: string) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    const { token, expiresAt } = await this.scanTokenService.issueMemberToken({
      userId: user.id,
      eventId
    });
    return { token, expiresAt };
  }
}
