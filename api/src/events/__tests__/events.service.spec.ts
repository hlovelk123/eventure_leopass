import { ConfigService } from '@nestjs/config';
import { addMinutes } from 'date-fns';
import { NotificationCategory, ReportCategory, RoleAssignment, RoleLevel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventsService } from '../events.service.js';
import { SessionUser } from '../../auth/services/session.service.js';
import type { NotificationsService } from '../../notifications/notifications.service.js';

function toSessionUser<T extends { roleAssignments: RoleAssignment[] }>(user: T): SessionUser {
  return user as SessionUser;
}

describe('EventsService', () => {
  let prisma: PrismaService;
  let service: EventsService;
  let createNotificationMock: jest.MockedFunction<NotificationsService['createNotification']>;
  let getFeedMock: jest.MockedFunction<NotificationsService['getFeed']>;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/leopass?schema=public';
    const config = new ConfigService();
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    createNotificationMock = jest.fn().mockResolvedValue({
      id: 'notification',
      deliveries: []
    });
    getFeedMock = jest.fn().mockResolvedValue({
      notifications: [],
      nextCursor: null
    });
    service = new EventsService(
      prisma,
      {
        createNotification: createNotificationMock,
        getFeed: getFeedMock
      } as unknown as NotificationsService
    );
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(() => {
    createNotificationMock.mockClear();
    getFeedMock.mockClear();
  });

  it('returns member dashboard data with today event', async () => {
    const club = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.club.create({
        data: {
          name: 'Central Club'
        }
      })
    );

    const member = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.user.create({
        data: {
          email: `member-${Date.now()}@example.com`,
          displayName: 'Member Example',
          status: 'ACTIVE',
          primaryClubId: club.id
        },
        include: {
          roleAssignments: true
        }
      })
    );

    const event = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.event.create({
        data: {
          name: 'Today Event',
          startTime: new Date(),
          endTime: addMinutes(new Date(), 90),
          hostClubId: club.id,
          allowWalkIns: true
        }
      })
    );

    await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.memberEventPass.create({
        data: {
          eventId: event.id,
          userId: member.id,
          status: 'ACTIVE'
        }
      })
    );

    const dashboard = await service.getMemberDashboard(toSessionUser(member));
    expect(dashboard.today.some((item) => item.id === event.id)).toBe(true);
  });

  it('creates events for admin and extends duration', async () => {
    const club = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.club.create({
        data: {
          name: `Admin Club ${Date.now()}`
        }
      })
    );

    const admin = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.user.create({
        data: {
          email: `admin-${Date.now()}@example.com`,
          displayName: 'Admin User',
          status: 'ACTIVE',
          roleAssignments: {
            create: {
              level: RoleLevel.CLUB,
              roleTitle: 'Club Admin',
              clubId: club.id,
              startTs: new Date(),
              active: true
            }
          }
        },
        include: {
          roleAssignments: true
        }
      })
    );

    const created = await service.createEvent(toSessionUser(admin), {
      name: 'New Event',
      startTime: new Date(),
      endTime: addMinutes(new Date(), 120),
      hostClubId: club.id,
      allowWalkIns: true,
      rsvpRequired: false
    });

    expect(created.name).toBe('New Event');

    const extended = await service.extendEvent(toSessionUser(admin), created.id, {
      minutes: 30,
      reason: 'Speakers running late'
    });

    expect(extended.endTime.getTime()).toBeGreaterThan(created.endTime.getTime());
  });

  it('allows steward manual check-in and walk-in', async () => {
    const club = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.club.create({
        data: {
          name: `Steward Club ${Date.now()}`
        }
      })
    );

    const steward = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.user.create({
        data: {
          email: `steward-${Date.now()}@example.com`,
          displayName: 'Steward User',
          status: 'ACTIVE',
          roleAssignments: {
            create: {
              level: RoleLevel.CLUB,
              roleTitle: 'Steward',
              clubId: club.id,
              startTs: new Date(),
              active: true
            }
          }
        },
        include: {
          roleAssignments: true
        }
      })
    );

    const member = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.user.create({
        data: {
          email: `member2-${Date.now()}@example.com`,
          displayName: 'Member Two',
          status: 'ACTIVE'
        },
        include: {
          roleAssignments: true
        }
      })
    );

    const event = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.event.create({
        data: {
          name: 'Steward Event',
          startTime: new Date(),
          endTime: addMinutes(new Date(), 180),
          hostClubId: club.id
        }
      })
    );

    await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.memberEventPass.create({
        data: {
          eventId: event.id,
          userId: member.id,
          status: 'ACTIVE'
        }
      })
    );

    await service.manualAttendanceAction(toSessionUser(steward), event.id, {
      action: 'check_in',
      memberId: member.id,
      reason: 'Manual correction'
    });

    const lastCall = createNotificationMock.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const [rawPayload] = lastCall ?? [];
    const payload = rawPayload as {
      userId: string;
      category: NotificationCategory;
      title: string;
      body: string;
      data: Record<string, unknown>;
    };
    expect(payload).toMatchObject({
      userId: member.id,
      category: NotificationCategory.EVENT
    });
    expect(typeof payload.title === 'string' && payload.title.includes('Checked in')).toBe(true);
    expect(typeof payload.body === 'string' && payload.body.includes('check-in')).toBe(true);
    expect(payload.data).toMatchObject({
      eventId: event.id,
      action: 'check_in',
      stewardId: steward.id
    });

    const stats = await service.getStewardEventStats(toSessionUser(steward), event.id);
    expect(stats.present).toBeGreaterThanOrEqual(1);

    const walkIn = await service.addWalkIn(toSessionUser(steward), event.id, {
      name: 'Guest Example',
      type: 'Guest'
    });
    expect(walkIn.guest.name).toBe('Guest Example');
  });

  it('generates ordered event report and CSV export', async () => {
    const start = addMinutes(new Date(), -120);
    const end = addMinutes(start, 180);

    const club = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.club.create({
        data: {
          name: `Report Club ${Date.now()}`
        }
      })
    );

    const admin = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.user.create({
        data: {
          email: `report-admin-${Date.now()}@example.com`,
          displayName: 'Report Admin',
          status: 'ACTIVE',
          roleAssignments: {
            create: {
              level: RoleLevel.CLUB,
              roleTitle: 'Club Admin',
              clubId: club.id,
              startTs: new Date(),
              active: true
            }
          }
        },
        include: {
          roleAssignments: true
        }
      })
    );

    const event = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.event.create({
        data: {
          name: `Reporting Event ${Date.now()}`,
          startTime: start,
          endTime: end,
          status: 'ACTIVE',
          mode: 'NO_RSVP',
          hostClubId: club.id,
          allowWalkIns: true
        }
      })
    );

    const guest = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.invitedGuestEventAttendee.create({
        data: {
          eventId: event.id,
          name: 'VIP Guest',
          email: 'vip@example.com',
          type: 'VIP',
          createdByStewardId: admin.id,
          checkInTime: addMinutes(start, 15),
          checkOutTime: addMinutes(start, 75),
          method: 'MANUAL'
        }
      })
    );

    await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.attendanceSession.create({
        data: {
          eventId: event.id,
          invitedGuestId: guest.id,
          checkInTs: guest.checkInTime,
          checkOutTs: guest.checkOutTime,
          method: 'MANUAL',
          reportCategory: ReportCategory.INVITED_GUESTS
        }
      })
    );

    const member = await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.user.create({
        data: {
          email: `report-member-${Date.now()}@example.com`,
          displayName: 'Report Member',
          status: 'ACTIVE',
          primaryClubId: club.id
        },
        include: {
          roleAssignments: true
        }
      })
    );

    await prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.attendanceSession.create({
        data: {
          eventId: event.id,
          userId: member.id,
          checkInTs: addMinutes(start, 45),
          checkOutTs: addMinutes(start, 120),
          method: 'STEWARD',
          reportCategory: ReportCategory.CLUB_MEMBERS
        }
      })
    );

    const report = await service.getEventReport(toSessionUser(admin), event.id);
    expect(report.totals.totalAttendees).toBe(2);
    expect(report.categories[0]?.category).toBe(ReportCategory.INVITED_GUESTS);
    expect(report.categories[0]?.attendeeCount).toBe(1);
    const clubMembersSummary = report.categories.find(
      (category) => category.category === ReportCategory.CLUB_MEMBERS
    );
    expect(clubMembersSummary?.attendeeCount).toBe(1);
    expect(report.attendees[0]?.category).toBe(ReportCategory.INVITED_GUESTS);
    expect(report.attendees[1]?.category).toBe(ReportCategory.CLUB_MEMBERS);

    const { csv } = await service.exportEventReportCsv(toSessionUser(admin), event.id);
    const csvLines = csv.split('\n');
    expect(csvLines[1]).toContain('Invited Guests');
    expect(csvLines[2]).toContain('Club Members');
  });
});
