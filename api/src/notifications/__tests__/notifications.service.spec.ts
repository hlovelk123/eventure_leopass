import { ConfigService } from '@nestjs/config';
import { NotificationChannel, NotificationPreference } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications.service.js';
import type { NotificationDeliveryJob } from '../notifications.types.js';

class QueueStub {
  public jobs: NotificationDeliveryJob[] = [];

  enqueueDelivery(job: NotificationDeliveryJob): Promise<void> {
    this.jobs.push(job);
    return Promise.resolve();
  }
}

describe('NotificationsService', () => {
  let prisma: PrismaService;
  let service: NotificationsService;
  let queue: QueueStub;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/leopass?schema=public';
    const config = new ConfigService({
      ENABLE_PUSH_NOTIFICATIONS: true
    });
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    queue = new QueueStub();
    service = new NotificationsService(prisma, queue, config);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    queue.jobs = [];
    await prisma.runWithClaims({ roles: ['system'] }, async (tx) => {
      await tx.notificationDelivery.deleteMany();
      await tx.notification.deleteMany();
      await tx.notificationSubscription.deleteMany();
      await tx.userNotificationPreference.deleteMany();
    });
  });

  it('creates notifications respecting channel preferences and subscriptions', async () => {
    const user = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.user.create({
        data: {
          email: `notify-${Date.now()}@example.com`,
          displayName: 'Notify User',
          status: 'ACTIVE'
        }
      })
    );

    await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.userNotificationPreference.create({
        data: {
          userId: user.id,
          channel: NotificationChannel.EMAIL,
          preference: NotificationPreference.DISABLED
        }
      })
    );

    await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.notificationSubscription.create({
        data: {
          userId: user.id,
          endpoint: `https://push.example.com/${Date.now()}`,
          p256dh: 'p256dh-key',
          auth: 'auth-key'
        }
      })
    );

    const notification = await service.createNotification({
      userId: user.id,
      category: 'EVENT',
      title: 'Manual check-in',
      body: 'A steward checked you in.'
    });

    expect(notification.deliveries).toHaveLength(1);
    expect(notification.deliveries[0]?.channel).toBe(NotificationChannel.PUSH);
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]?.notificationId).toBe(notification.id);

    const feed = await service.getFeed(user.id, {});
    expect(feed.notifications).toHaveLength(1);
    expect(feed.notifications[0]?.title).toBe('Manual check-in');
  });

  it('updates preferences and marks notifications as read', async () => {
    const user = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.user.create({
        data: {
          email: `pref-${Date.now()}@example.com`,
          displayName: 'Pref User',
          status: 'ACTIVE'
        }
      })
    );

    await service.updatePreferences(user.id, { pushEnabled: false, emailEnabled: true });
    const prefs = await service.getPreferences(user.id);
    expect(prefs.pushEnabled).toBe(false);
    expect(prefs.emailEnabled).toBe(true);

    const notification = await service.createNotification({
      userId: user.id,
      category: 'SYSTEM',
      title: 'Welcome',
      body: 'Thanks for joining Leo Pass.',
      channels: [NotificationChannel.IN_APP]
    });

    const updated = await service.markAsRead(user.id, [notification.id]);
    expect(updated).toBe(1);

    const cleared = await service.markAllAsRead(user.id);
    expect(cleared).toBe(0);
  });
});
