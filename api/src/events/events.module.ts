import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { EventsService } from './events.service.js';
import { MemberEventsController } from './controllers/member-events.controller.js';
import { StewardEventsController } from './controllers/steward-events.controller.js';
import { AdminEventsController } from './controllers/admin-events.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  providers: [EventsService],
  controllers: [MemberEventsController, StewardEventsController, AdminEventsController],
  exports: [EventsService]
})
export class EventsModule {}
