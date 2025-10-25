import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsQueueService } from './notifications.queue.js';
import { NotificationsProcessor } from './notifications.processor.js';
import { NOTIFICATIONS_QUEUE } from './notifications.constants.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BullModule.registerQueue({
      name: NOTIFICATIONS_QUEUE
    })
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsQueueService, NotificationsProcessor],
  exports: [NotificationsService, NotificationsQueueService]
})
export class NotificationsModule {}
