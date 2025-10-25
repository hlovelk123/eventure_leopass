import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SessionService } from '../../auth/services/session.service.js';
import { EventsService } from '../events.service.js';
import { CreateEventDto } from '../dto/create-event.dto.js';
import { UpdateEventDto } from '../dto/update-event.dto.js';
import { ExtendEventDto } from '../dto/extend-event.dto.js';

@Controller('admin')
export class AdminEventsController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly eventsService: EventsService
  ) {}

  @Get('dashboard')
  async dashboard(@Req() req: Request) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    return this.eventsService.getAdminDashboard(user);
  }

  @Get('events')
  async listEvents(@Req() req: Request) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    return this.eventsService.getAdminEvents(user);
  }

  @Post('events')
  async createEvent(@Req() req: Request, @Body() body: CreateEventDto) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    return this.eventsService.createEvent(user, body);
  }

  @Patch('events/:eventId')
  async updateEvent(@Req() req: Request, @Param('eventId') eventId: string, @Body() body: UpdateEventDto) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    return this.eventsService.updateEvent(user, eventId, body);
  }

  @Post('events/:eventId/extend')
  async extendEvent(@Req() req: Request, @Param('eventId') eventId: string, @Body() body: ExtendEventDto) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    return this.eventsService.extendEvent(user, eventId, body);
  }
}
