import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import webPush, { type PushSubscription } from 'web-push';
import { NotificationChannel, NotificationDeliveryStatus, Prisma } from '@prisma/client';
import { NOTIFICATIONS_JOB_DELIVER, NOTIFICATIONS_QUEUE } from './notifications.constants.js';
import type { NotificationDeliveryJob } from './notifications.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../auth/services/email.service.js';

@Processor(NOTIFICATIONS_QUEUE)
@Injectable()
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private readonly pushFeatureEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService
  ) {
    super();
    this.pushFeatureEnabled = this.configService.get<boolean>('ENABLE_PUSH_NOTIFICATIONS', true);

    if (this.pushFeatureEnabled) {
      const vapidPublic = this.configService.get<string>('WEB_PUSH_VAPID_PUBLIC_KEY');
      const vapidPrivate = this.configService.get<string>('WEB_PUSH_VAPID_PRIVATE_KEY');
      const vapidSubject = this.configService.get<string>('WEB_PUSH_VAPID_SUBJECT');

      if (vapidPublic && vapidPrivate && vapidSubject) {
        webPush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
      } else {
        this.logger.warn('Push notifications enabled but VAPID configuration incomplete.');
      }
    }
  }

  async process(job: Job<NotificationDeliveryJob>): Promise<void> {
    if (job.name && job.name !== NOTIFICATIONS_JOB_DELIVER) {
      this.logger.warn(`Skipping unexpected notifications job: ${job.name}`);
      return;
    }

    const { notificationId, channel } = job.data;

    const delivery = await this.prisma.notificationDelivery.findFirst({
      where: {
        notificationId,
        channel
      }
    });

    if (!delivery || delivery.status === NotificationDeliveryStatus.SENT || delivery.status === NotificationDeliveryStatus.DISABLED) {
      return;
    }

    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        user: true
      }
    });

    if (!notification) {
      await this.markDelivery(delivery.id, NotificationDeliveryStatus.FAILED, 'Notification not found');
      return;
    }

    try {
      if (channel === NotificationChannel.PUSH && !this.pushFeatureEnabled) {
        await this.markDelivery(delivery.id, NotificationDeliveryStatus.DISABLED, 'Push notifications disabled');
        return;
      }

      if (channel === NotificationChannel.PUSH) {
        await this.deliverPush(delivery.id, notification);
      } else if (channel === NotificationChannel.EMAIL) {
        await this.deliverEmail(delivery.id, notification);
      } else {
        await this.markDelivery(delivery.id, NotificationDeliveryStatus.DISABLED, 'Channel not supported');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown delivery error';
      await this.markDelivery(delivery.id, NotificationDeliveryStatus.FAILED, message);
      this.logger.error(`Notification delivery failed (${channel}): ${message}`);
    }
  }

  private async deliverPush(deliveryId: string, notification: Prisma.NotificationGetPayload<{ include: { user: true } }>): Promise<void> {
    const subscriptions = await this.prisma.notificationSubscription.findMany({
      where: {
        userId: notification.userId
      }
    });

    if (subscriptions.length === 0) {
      await this.markDelivery(deliveryId, NotificationDeliveryStatus.DISABLED, 'No push subscriptions registered');
      return;
    }

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      data: notification.data,
      category: notification.category,
      notificationId: notification.id
    });

    let successCount = 0;
    let lastError: string | null = null;

    for (const subscription of subscriptions) {
      const pushSubscription: PushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          auth: subscription.auth,
          p256dh: subscription.p256dh
        }
      };

      try {
        await webPush.sendNotification(pushSubscription, payload);
        successCount += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await this.prisma.notificationSubscription.delete({
            where: {
              userId_endpoint: {
                userId: subscription.userId,
                endpoint: subscription.endpoint
              }
            }
          });
        }
        const message = error instanceof Error ? error.message : 'Failed to send push notification';
        lastError = message;
        this.logger.warn(`Push delivery error for ${subscription.endpoint}: ${message}`);
      }
    }

    if (successCount > 0) {
      await this.markDelivery(deliveryId, NotificationDeliveryStatus.SENT, null);
    } else {
      await this.markDelivery(
        deliveryId,
        NotificationDeliveryStatus.FAILED,
        lastError ?? 'All push deliveries failed'
      );
    }
  }

  private async deliverEmail(deliveryId: string, notification: Prisma.NotificationGetPayload<{ include: { user: true } }>): Promise<void> {
    const recipient = notification.user.email;
    if (!recipient) {
      await this.markDelivery(deliveryId, NotificationDeliveryStatus.DISABLED, 'User has no email address');
      return;
    }

    const html = this.renderEmailHtml(notification.title, notification.body, notification.data);
    const text = this.renderEmailText(notification.body);

    await this.emailService.sendNotificationEmail({
      to: recipient,
      subject: `[Leo Pass] ${notification.title}`,
      html,
      text
    });

    await this.markDelivery(deliveryId, NotificationDeliveryStatus.SENT, null);
  }

  private async markDelivery(deliveryId: string, status: NotificationDeliveryStatus, error: string | null): Promise<void> {
    const updated = await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        error
      },
      select: {
        notificationId: true
      }
    });

    if (status === NotificationDeliveryStatus.SENT) {
      await this.prisma.notification.update({
        where: { id: updated.notificationId },
        data: {
          sentAt: new Date()
        }
      });
    }
  }

  private renderEmailHtml(title: string, body: string, data: Prisma.JsonValue | null): string {
    const safeBody = this.escapeHtml(body).replace(/\n/g, '<br/>');
    const extra = data
      ? `<pre style="background:#f5f5f5;padding:12px;border-radius:8px;">${this.escapeHtml(JSON.stringify(data, null, 2))}</pre>`
      : '';
    return `
      <div style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#1f2937;line-height:1.5;">
        <h1 style="font-size:18px;margin-bottom:8px;color:#1463FF;">${this.escapeHtml(title)}</h1>
        <p>${safeBody}</p>
        ${extra}
        <p style="margin-top:24px;font-size:12px;color:#6b7280;">You are receiving this email because you have notifications enabled in Leo Pass.</p>
      </div>
    `;
  }

  private renderEmailText(body: string): string {
    return body;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return char;
      }
    });
  }
}
