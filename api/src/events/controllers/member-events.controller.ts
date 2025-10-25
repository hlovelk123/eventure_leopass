import { Controller, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SessionService } from '../../auth/services/session.service.js';
import { EventsService } from '../events.service.js';

@Controller('member')
export class MemberEventsController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly eventsService: EventsService
  ) {}

  @Get('dashboard')
  async getDashboard(@Req() req: Request) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    return this.eventsService.getMemberDashboard(user);
  }

  @Get('events/:eventId')
  async getEvent(@Req() req: Request, @Param('eventId') eventId: string) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    return this.eventsService.getMemberEventDetail(user, eventId);
  }
}
