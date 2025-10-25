import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { NOTIFICATIONS_JOB_DELIVER, NOTIFICATIONS_QUEUE } from './notifications.constants.js';
import type { NotificationDeliveryJob } from './notifications.types.js';

@Injectable()
export class NotificationsQueueService {
  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly queue: Queue<NotificationDeliveryJob>
  ) {}

  async enqueueDelivery(job: NotificationDeliveryJob): Promise<void> {
    await this.queue.add(NOTIFICATIONS_JOB_DELIVER, job, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5_000
      },
      removeOnComplete: true,
      removeOnFail: false
    });
  }
}
