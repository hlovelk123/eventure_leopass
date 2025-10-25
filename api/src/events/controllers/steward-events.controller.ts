import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SessionService } from '../../auth/services/session.service.js';
import { EventsService } from '../events.service.js';
import { AddWalkInDto } from '../dto/add-walk-in.dto.js';
import { ManualAttendanceActionDto } from '../dto/manual-action.dto.js';

@Controller('steward')
export class StewardEventsController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly eventsService: EventsService
  ) {}

  @Get('events')
  async listEvents(@Req() req: Request) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    return this.eventsService.getStewardDashboard(user);
  }

  @Get('events/:eventId/summary')
  async getSummary(@Req() req: Request, @Param('eventId') eventId: string) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    return this.eventsService.getStewardEventStats(user, eventId);
  }

  @Post('events/:eventId/walk-ins')
  async addWalkIn(@Req() req: Request, @Param('eventId') eventId: string, @Body() body: AddWalkInDto) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    return this.eventsService.addWalkIn(user, eventId, body);
  }

  @Post('events/:eventId/manual-attendance')
  async manualAttendance(
    @Req() req: Request,
    @Param('eventId') eventId: string,
    @Body() body: ManualAttendanceActionDto
  ) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    return this.eventsService.manualAttendanceAction(user, eventId, body);
  }
}
