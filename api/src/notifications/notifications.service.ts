import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Notification,
  NotificationChannel,
  NotificationDelivery,
  NotificationDeliveryStatus,
  NotificationPreference,
  Prisma
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsQueueService } from './notifications.queue.js';
import type {
  CreateNotificationParams,
  NotificationFeedItem,
  NotificationFeedResponse
} from './notifications.types.js';
import type { NotificationDeliveryJob } from './notifications.types.js';

const DEFAULT_CHANNELS: NotificationChannel[] = [
  NotificationChannel.IN_APP,
  NotificationChannel.PUSH,
  NotificationChannel.EMAIL
];

type NotificationWithDeliveries = Notification & { deliveries: NotificationDelivery[] };

@Injectable()
export class NotificationsService {
  private readonly pushFeatureEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: NotificationsQueueService,
    private readonly configService: ConfigService
  ) {
    this.pushFeatureEnabled = this.configService.get<boolean>('ENABLE_PUSH_NOTIFICATIONS', true);
  }

  async createNotification(params: CreateNotificationParams): Promise<NotificationWithDeliveries> {
    const requestedChannels = params.channels ?? DEFAULT_CHANNELS;
    const eligibleChannels = await this.filterChannels(params.userId, requestedChannels);
    const deliveryChannels = eligibleChannels.filter((channel) => channel !== NotificationChannel.IN_APP);

    const notification = await this.withSystemClaims((tx) =>
      tx.notification.create({
        data: {
          userId: params.userId,
          category: params.category,
          title: params.title,
          body: params.body,
          data: params.data ?? undefined,
          sentAt: new Date(),
          deliveries: deliveryChannels.length
            ? {
                create: deliveryChannels.map((channel) => ({
                  channel,
                  status: NotificationDeliveryStatus.QUEUED
                }))
              }
            : undefined
        },
        include: {
          deliveries: true
        }
      })
    );

    await this.enqueueDeliveries(notification);

    return notification;
  }

  async getFeed(
    userId: string,
    params: { cursor?: string; limit?: number }
  ): Promise<NotificationFeedResponse> {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const notifications = await this.withUserClaims(userId, (tx) =>
      tx.notification.findMany({
        where: { userId },
        include: { deliveries: true },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(params.cursor
          ? {
              skip: 1,
              cursor: { id: params.cursor }
            }
          : {})
      })
    );

    const hasMore = notifications.length > limit;
    const items = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      notifications: items.map((item) => this.serializeNotification(item)),
      nextCursor
    };
  }

  async markAsRead(userId: string, notificationIds: string[]): Promise<number> {
    if (notificationIds.length === 0) {
      return 0;
    }
    const result = await this.withUserClaims(userId, (tx) =>
      tx.notification.updateMany({
        where: {
          userId,
          id: { in: notificationIds },
          readAt: null
        },
        data: {
          readAt: new Date()
        }
      })
    );
    return result.count;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.withUserClaims(userId, (tx) =>
      tx.notification.updateMany({
        where: {
          userId,
          readAt: null
        },
        data: {
          readAt: new Date()
        }
      })
    );
    return result.count;
  }

  async registerSubscription(
    userId: string,
    input: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string | null; expirationTime?: string | null }
  ): Promise<void> {
    await this.withUserClaims(userId, (tx) =>
      tx.notificationSubscription.upsert({
        where: {
          userId_endpoint: {
            userId,
            endpoint: input.endpoint
          }
        },
        create: {
          userId,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent ?? null,
          expiresAt: input.expirationTime ? new Date(input.expirationTime) : null
        },
        update: {
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent ?? null,
          expiresAt: input.expirationTime ? new Date(input.expirationTime) : null,
          lastSeenAt: new Date()
        }
      })
    );
  }

  async removeSubscription(userId: string, endpoint: string): Promise<void> {
    await this.withUserClaims(userId, (tx) =>
      tx.notificationSubscription.deleteMany({
        where: {
          userId,
          endpoint
        }
      })
    );
  }

  async getPreferences(userId: string): Promise<{ pushEnabled: boolean; emailEnabled: boolean; inAppEnabled: boolean }> {
    const preferences = await this.withUserClaims(userId, (tx) =>
      tx.userNotificationPreference.findMany({
        where: { userId }
      })
    );
    const map = new Map(preferences.map((pref) => [pref.channel, pref.preference]));
    const pushAllowed = map.get(NotificationChannel.PUSH) !== NotificationPreference.DISABLED && this.pushFeatureEnabled;
    const emailAllowed = map.get(NotificationChannel.EMAIL) !== NotificationPreference.DISABLED;
    return {
      pushEnabled: pushAllowed,
      emailEnabled: emailAllowed,
      inAppEnabled: true
    };
  }

  async updatePreferences(
    userId: string,
    input: { pushEnabled?: boolean; emailEnabled?: boolean }
  ): Promise<void> {
    const operations: Promise<unknown>[] = [];

    if (input.pushEnabled !== undefined) {
      operations.push(
        this.upsertPreference(userId, NotificationChannel.PUSH, input.pushEnabled)
      );
    }

    if (input.emailEnabled !== undefined) {
      operations.push(
        this.upsertPreference(userId, NotificationChannel.EMAIL, input.emailEnabled)
      );
    }

    await Promise.all(operations);
  }

  private async upsertPreference(userId: string, channel: NotificationChannel, enabled: boolean): Promise<void> {
    await this.withUserClaims(userId, (tx) =>
      tx.userNotificationPreference.upsert({
        where: {
          userId_channel: {
            userId,
            channel
          }
        },
        create: {
          userId,
          channel,
          preference: enabled ? NotificationPreference.ENABLED : NotificationPreference.DISABLED
        },
        update: {
          preference: enabled ? NotificationPreference.ENABLED : NotificationPreference.DISABLED
        }
      })
    );
  }

  private async filterChannels(userId: string, requestedChannels: NotificationChannel[]): Promise<NotificationChannel[]> {
    const uniqueChannels = Array.from(
      new Set([...requestedChannels, NotificationChannel.IN_APP])
    );

    const allowed = await this.withSystemClaims(async (tx) => {
      const [preferences, subscriptionCount, user] = await Promise.all([
        tx.userNotificationPreference.findMany({
          where: { userId }
        }),
        tx.notificationSubscription.count({
          where: { userId }
        }),
        tx.user.findUnique({
          where: { id: userId },
          select: {
            email: true
          }
        })
      ]);

      const disabledChannels = new Set(
        preferences.filter((pref) => pref.preference === NotificationPreference.DISABLED).map((pref) => pref.channel)
      );

      return uniqueChannels.filter((channel) => {
        if (channel === NotificationChannel.IN_APP) {
          return true;
        }
        if (disabledChannels.has(channel)) {
          return false;
        }
        if (channel === NotificationChannel.PUSH) {
          return this.pushFeatureEnabled && subscriptionCount > 0;
        }
        if (channel === NotificationChannel.EMAIL) {
          return Boolean(user?.email);
        }
        return false;
      });
    });

    if (!allowed.includes(NotificationChannel.IN_APP)) {
      allowed.push(NotificationChannel.IN_APP);
    }

    return allowed;
  }

  private serializeNotification(notification: NotificationWithDeliveries): NotificationFeedItem {
    return {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      category: notification.category,
      data: notification.data ?? null,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
      deliveries: notification.deliveries.map((delivery) => ({
        id: delivery.id,
        channel: delivery.channel,
        status: delivery.status,
        attempts: delivery.attempts,
        lastAttemptAt: delivery.lastAttemptAt ? delivery.lastAttemptAt.toISOString() : null,
        error: delivery.error ?? null
      }))
    };
  }

  private async enqueueDeliveries(notification: NotificationWithDeliveries): Promise<void> {
    const jobs: NotificationDeliveryJob[] = notification.deliveries.map((delivery) => ({
      notificationId: notification.id,
      channel: delivery.channel
    }));

    await Promise.all(jobs.map((job) => this.queue.enqueueDelivery(job)));
  }

  private withSystemClaims<T>(fn: (client: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.runWithClaims({ roles: ['system'] }, fn);
  }

  private withUserClaims<T>(userId: string, fn: (client: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.runWithClaims({ userId }, fn);
  }
}
