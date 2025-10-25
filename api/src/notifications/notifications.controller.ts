import { Body, Controller, Delete, Get, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SessionService } from '../auth/services/session.service.js';
import { NotificationsService } from './notifications.service.js';
import { RegisterSubscriptionDto } from './dto/register-subscription.dto.js';
import { RemoveSubscriptionDto } from './dto/remove-subscription.dto.js';
import { UpdatePreferencesDto } from './dto/update-preferences.dto.js';
import { MarkReadDto } from './dto/mark-read.dto.js';
import { FeedQueryDto } from './dto/feed-query.dto.js';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly notificationsService: NotificationsService
  ) {}

  @Get()
  async getFeed(@Req() req: Request, @Query() query: FeedQueryDto) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    return this.notificationsService.getFeed(user.id, query);
  }

  @Patch('mark-read')
  async markRead(@Req() req: Request, @Body() body: MarkReadDto) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    const updated = await this.notificationsService.markAsRead(user.id, body.notificationIds);
    return { updated };
  }

  @Patch('mark-all-read')
  async markAllRead(@Req() req: Request) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    const updated = await this.notificationsService.markAllAsRead(user.id);
    return { updated };
  }

  @Get('preferences')
  async getPreferences(@Req() req: Request) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    return this.notificationsService.getPreferences(user.id);
  }

  @Put('preferences')
  async updatePreferences(@Req() req: Request, @Body() body: UpdatePreferencesDto) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    await this.notificationsService.updatePreferences(user.id, body);
    return this.notificationsService.getPreferences(user.id);
  }

  @Post('subscriptions')
  async registerSubscription(@Req() req: Request, @Body() body: RegisterSubscriptionDto) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    await this.notificationsService.registerSubscription(user.id, body);
    return { success: true };
  }

  @Delete('subscriptions')
  async deleteSubscription(@Req() req: Request, @Body() body: RemoveSubscriptionDto) {
    const { user } = await this.sessionService.validateFromRequest(req.headers);
    await this.notificationsService.removeSubscription(user.id, body.endpoint);
    return { success: true };
  }
}
