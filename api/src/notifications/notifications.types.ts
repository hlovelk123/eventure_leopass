import { NotificationCategory, NotificationChannel, NotificationDeliveryStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export type NotificationDeliveryJob = {
  notificationId: string;
  channel: NotificationChannel;
};

export type CreateNotificationParams = {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  data?: Prisma.JsonValue | null;
  channels?: NotificationChannel[];
};

export type NotificationDeliverySummary = {
  id: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  attempts: number;
  lastAttemptAt: string | null;
  error: string | null;
};

export type NotificationFeedItem = {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  data: Prisma.JsonValue | null;
  createdAt: string;
  readAt: string | null;
  deliveries: NotificationDeliverySummary[];
};

export type NotificationFeedResponse = {
  notifications: NotificationFeedItem[];
  nextCursor: string | null;
};
