import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AttendanceMethod, Event, EventMode, MemberEventPassStatus, Prisma, ReportCategory, NotificationCategory } from '@prisma/client';
import { addMinutes, endOfDay, isBefore, isWithinInterval, startOfDay } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service.js';
import { SessionUser } from '../auth/services/session.service.js';
import {
  buildClaims,
  ensureAdminAccess,
  ensureStewardAccess,
  resolveEventWhereClause,
  resolveRoleScope
} from '../users/role.utils.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { UpdateEventDto } from './dto/update-event.dto.js';
import { ExtendEventDto } from './dto/extend-event.dto.js';
import { AddWalkInDto } from './dto/add-walk-in.dto.js';
import { ManualAttendanceActionDto } from './dto/manual-action.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export type MemberDashboard = {
  today: MemberEventSummary[];
  upcoming: MemberEventSummary[];
  history: AttendanceHistoryItem[];
  notifications: MemberNotification[];
};

export type MemberEventSummary = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETE';
  venue?: string | null;
  allowWalkIns: boolean;
  requireRsvp: boolean;
};

export type AttendanceHistoryItem = {
  eventId: string;
  eventName: string;
  checkInTs: string;
  checkOutTs: string | null;
  method: AttendanceMethod;
  reportCategory: string;
};

export type MemberNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  category: NotificationCategory;
};

export type StewardEventSummary = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  activeSessions: number;
  totalPasses: number;
};

export type StewardDashboard = {
  events: StewardEventSummary[];
};

export type StewardEventStats = {
  eventId: string;
  present: number;
  checkedOut: number;
  queued: number;
  totalPasses: number;
};

export type AdminEventItem = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  allowWalkIns: boolean;
  requireRsvp: boolean;
  hostClubId?: string | null;
  status: string;
};

export type AdminDashboard = {
  totals: {
    activeMembers: number;
    invitedMembers: number;
    activeSessions: number;
    upcomingEvents: number;
  };
  upcoming: AdminEventItem[];
  pendingInvites: { id: string; email: string; displayName: string }[];
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService
  ) {}

  async getMemberDashboard(user: SessionUser): Promise<MemberDashboard> {
    const scope = resolveRoleScope(user.roleAssignments);
    const claims = buildClaims(user.id, scope, ['member']);

    const passes = await this.prisma.runWithClaims(claims, (tx) =>
      tx.memberEventPass.findMany({
        where: {
          userId: user.id,
          status: {
            in: [MemberEventPassStatus.PROVISIONED, MemberEventPassStatus.ACTIVE]
          }
        },
        include: {
          event: true
        }
      })
    );

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const today: MemberEventSummary[] = [];
    const upcoming: MemberEventSummary[] = [];

    for (const pass of passes) {
      const event = pass.event;
      const status = this.resolveMemberEventStatus(event, now);
      const summary: MemberEventSummary = {
        id: event.id,
        name: event.name,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        venue: event.locationGeoJson,
        allowWalkIns: event.allowWalkIns,
        requireRsvp: event.mode === EventMode.RSVP,
        status
      };

      if (isWithinInterval(event.startTime, { start: todayStart, end: todayEnd }) || isWithinInterval(event.endTime, { start: todayStart, end: todayEnd })) {
        today.push(summary);
      } else if (isBefore(now, event.startTime)) {
        upcoming.push(summary);
      }
    }

    const historyRecords = await this.prisma.runWithClaims(claims, (tx) =>
      tx.attendanceSession.findMany({
        where: {
          userId: user.id
        },
        include: {
          event: true
        },
        orderBy: {
          checkInTs: 'desc'
        },
        take: 20
      })
    );

    const history: AttendanceHistoryItem[] = historyRecords.map((session) => ({
      eventId: session.eventId,
      eventName: session.event.name,
      checkInTs: session.checkInTs?.toISOString() ?? '',
      checkOutTs: session.checkOutTs?.toISOString() ?? null,
      method: session.method,
      reportCategory: session.reportCategory
    }));

    let notifications: MemberNotification[] = [];
    try {
      const feed = await this.notificationsService.getFeed(user.id, { limit: 10 });
      notifications = feed.notifications.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        createdAt: item.createdAt,
        readAt: item.readAt,
        category: item.category
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown notifications error';
      this.logger.warn(`Failed to load notification feed for user ${user.id}: ${message}`);
    }

    if (notifications.length === 0) {
      notifications = this.buildMemberNotifications(today, upcoming, history, now);
    }

    return { today, upcoming, history, notifications };
  }

  async getMemberEventDetail(user: SessionUser, eventId: string): Promise<Event> {
    const scope = resolveRoleScope(user.roleAssignments);
    const claims = buildClaims(user.id, scope, ['member']);

    const event = await this.prisma.runWithClaims(claims, (tx) =>
      tx.event.findFirst({
        where: {
          id: eventId,
          passes: {
            some: {
              userId: user.id
            }
          }
        }
      })
    );

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  private resolveMemberEventStatus(event: Event, now: Date): 'UPCOMING' | 'ACTIVE' | 'COMPLETE' {
    if (isBefore(event.endTime, now)) {
      return 'COMPLETE';
    }
    if (isBefore(now, event.startTime)) {
      return 'UPCOMING';
    }
    return 'ACTIVE';
  }

  private buildMemberNotifications(
    today: MemberEventSummary[],
    upcoming: MemberEventSummary[],
    history: AttendanceHistoryItem[],
    now: Date
  ): MemberNotification[] {
    const notifications: MemberNotification[] = [];

    for (const event of today) {
      const startTime = new Date(event.startTime);
      if (startTime.getTime() - now.getTime() < 60 * 60 * 1000 && startTime > now) {
        notifications.push({
          id: `reminder-${event.id}`,
          title: `Your event starts soon`,
          body: `${event.name} begins at ${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          createdAt: now.toISOString(),
          readAt: null,
          category: NotificationCategory.REMINDER
        });
      }
    }

    if (history.length === 0 && today.length === 0 && upcoming.length === 0) {
      notifications.push({
        id: 'welcome-notification',
        title: 'Welcome to Leo Pass',
        body: 'Once events are scheduled for you, they will appear on this page.',
        createdAt: now.toISOString(),
        readAt: null,
        category: NotificationCategory.SYSTEM
      });
    }

    return notifications;
  }

  async getStewardDashboard(user: SessionUser): Promise<StewardDashboard> {
    const scope = resolveRoleScope(user.roleAssignments);
    ensureStewardAccess(scope);

    const claims = buildClaims(user.id, scope, ['steward']);
    const where = resolveEventWhereClause(scope);
    const now = new Date();
    const start = startOfDay(now);
    const end = endOfDay(now);

    const events = await this.prisma.runWithClaims(claims, (tx) =>
      tx.event.findMany({
        where: {
          ...where,
          startTime: {
            lte: end
          },
          endTime: {
            gte: start
          }
        },
        select: {
          id: true,
          name: true,
          startTime: true,
          endTime: true,
          passes: {
            select: { id: true }
          },
          attendance: {
            where: {
              checkOutTs: null
            },
            select: { id: true }
          }
        }
      })
    );

    const summaries: StewardEventSummary[] = events.map((event) => ({
      id: event.id,
      name: event.name,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      activeSessions: event.attendance.length,
      totalPasses: event.passes.length
    }));

    return { events: summaries };
  }

  async getStewardEventStats(user: SessionUser, eventId: string): Promise<StewardEventStats> {
    const scope = resolveRoleScope(user.roleAssignments);
    ensureStewardAccess(scope);

    const claims = buildClaims(user.id, scope, ['steward']);
    const where = resolveEventWhereClause(scope);

    const event = await this.prisma.runWithClaims(claims, (tx) =>
      tx.event.findFirst({
        where: {
          id: eventId,
          ...where
        },
        select: {
          id: true,
          passes: {
            select: { id: true }
          },
          attendance: {
            select: {
              id: true,
              checkOutTs: true
            }
          }
        }
      })
    );

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const present = event.attendance.filter((session) => session.checkOutTs === null).length;
    const checkedOut = event.attendance.length - present;

    return {
      eventId: event.id,
      present,
      checkedOut,
      queued: 0,
      totalPasses: event.passes.length
    };
  }

  async addWalkIn(user: SessionUser, eventId: string, dto: AddWalkInDto) {
    const scope = resolveRoleScope(user.roleAssignments);
    ensureStewardAccess(scope);
    const claims = buildClaims(user.id, scope, ['steward']);
    const where = resolveEventWhereClause(scope);

    return this.prisma.runWithClaims(claims, async (tx) => {
      const event = await tx.event.findFirst({
        where: {
          id: eventId,
          ...where
        }
      });

      if (!event) {
        throw new NotFoundException('Event not found');
      }

      const guest = await tx.invitedGuestEventAttendee.create({
        data: {
          eventId,
          name: dto.name,
          email: dto.email ?? null,
          type: dto.type ?? 'Guest',
          createdByStewardId: user.id,
          notes: dto.notes ?? null,
          method: AttendanceMethod.MANUAL,
          checkInTime: new Date()
        }
      });

      const session = await tx.attendanceSession.create({
        data: {
          eventId,
          invitedGuestId: guest.id,
          method: AttendanceMethod.MANUAL,
          reportCategory: ReportCategory.OUTSIDERS,
          scannerDeviceId: dto.scannerDeviceId ?? null,
          checkInTs: new Date()
        }
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'WALK_IN_ADDED',
          targetTable: 'InvitedGuestEventAttendee',
          targetId: guest.id,
          metadata: {
            eventId,
            name: dto.name,
            email: dto.email ?? null,
            type: dto.type ?? 'Guest'
          }
        }
      });

      return { guest, session };
    });
  }

  async manualAttendanceAction(user: SessionUser, eventId: string, dto: ManualAttendanceActionDto) {
    if (!dto.memberEmail && !dto.memberId) {
      throw new BadRequestException('Provide memberEmail or memberId');
    }

    const scope = resolveRoleScope(user.roleAssignments);
    ensureStewardAccess(scope);
    const claims = buildClaims(user.id, scope, ['steward']);
    const where = resolveEventWhereClause(scope);

    const result = await this.prisma.runWithClaims(claims, async (tx) => {
      const event = await tx.event.findFirst({
        where: {
          id: eventId,
          ...where
        }
      });

      if (!event) {
        throw new NotFoundException('Event not found');
      }

      const member = await tx.user.findFirst({
        where: dto.memberId
          ? { id: dto.memberId }
          : {
              email: dto.memberEmail?.toLowerCase()
            }
      });

      if (!member) {
        throw new NotFoundException('Member not found');
      }

      if (dto.action === 'check_in') {
        const existingSession = await tx.attendanceSession.findFirst({
          where: {
            eventId,
            userId: member.id,
            checkOutTs: null
          }
        });

        if (existingSession) {
          throw new BadRequestException('Member already checked in');
        }

        const session = await tx.attendanceSession.create({
          data: {
            eventId,
            userId: member.id,
            checkInTs: new Date(),
            method: AttendanceMethod.MANUAL,
            reportCategory: ReportCategory.CLUB_MEMBERS,
            scannerDeviceId: dto.scannerDeviceId ?? null
          }
        });

        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            action: 'MANUAL_CHECK_IN',
            targetTable: 'AttendanceSession',
            targetId: session.id,
            metadata: {
              eventId,
              memberId: member.id,
              reason: dto.reason
            }
          }
        });

        return {
          session,
          notify: {
            memberId: member.id,
            eventId,
            eventName: event.name,
            action: 'check_in' as const,
            stewardId: user.id,
            reason: dto.reason ?? null
          }
        };
      }

      const openSession = await tx.attendanceSession.findFirst({
        where: {
          eventId,
          userId: member.id,
          checkOutTs: null
        }
      });

      if (!openSession) {
        throw new BadRequestException('Member has no active session');
      }

      const updated = await tx.attendanceSession.update({
        where: { id: openSession.id },
        data: {
          checkOutTs: new Date(),
          scannerDeviceId: dto.scannerDeviceId ?? openSession.scannerDeviceId
        }
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'MANUAL_CHECK_OUT',
          targetTable: 'AttendanceSession',
          targetId: openSession.id,
          metadata: {
            eventId,
            memberId: member.id,
            reason: dto.reason
          }
        }
      });

      return {
        session: updated,
        notify: {
          memberId: member.id,
          eventId,
          eventName: event.name,
          action: 'check_out' as const,
          stewardId: user.id,
          reason: dto.reason ?? null
        }
      };
    });

    if (result?.notify) {
      const { memberId, eventId: notifyEventId, eventName, action, stewardId, reason } = result.notify;
      const title =
        action === 'check_in' ? `Checked in to ${eventName}` : `Checked out of ${eventName}`;
      const body =
        action === 'check_in'
          ? 'A steward confirmed your check-in.'
          : 'A steward confirmed your check-out.';
      await this.notificationsService.createNotification({
        userId: memberId,
        category: NotificationCategory.EVENT,
        title,
        body,
        data: {
          eventId: notifyEventId,
          action,
          stewardId,
          reason
        }
      });
    }

    return { session: result.session };
  }

  async createEvent(user: SessionUser, dto: CreateEventDto) {
    const scope = resolveRoleScope(user.roleAssignments);
    ensureAdminAccess(scope);
    const claims = buildClaims(user.id, scope, ['admin']);
    const mode = dto.rsvpRequired ? EventMode.RSVP : EventMode.NO_RSVP;

    return this.prisma.runWithClaims(claims, (tx) =>
      tx.event.create({
        data: {
          name: dto.name,
          startTime: dto.startTime,
          endTime: dto.endTime,
          hostClubId: dto.hostClubId ?? null,
          geofenceRadiusM: dto.geofenceRadiusM ?? 100,
          reminderBeforeEndMin: dto.reminderBeforeEndMin ?? 10,
          autoCheckoutGraceMin: dto.autoCheckoutGraceMin ?? 5,
          allowWalkIns: dto.allowWalkIns ?? true,
          mode
        }
      })
    );
  }

  async updateEvent(user: SessionUser, eventId: string, dto: UpdateEventDto) {
    const scope = resolveRoleScope(user.roleAssignments);
    ensureAdminAccess(scope);
    const claims = buildClaims(user.id, scope, ['admin']);
    const where = resolveEventWhereClause(scope);

    const data: Prisma.EventUncheckedUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.startTime !== undefined) data.startTime = dto.startTime;
    if (dto.endTime !== undefined) data.endTime = dto.endTime;
    if (dto.geofenceRadiusM !== undefined) data.geofenceRadiusM = dto.geofenceRadiusM;
    if (dto.reminderBeforeEndMin !== undefined) data.reminderBeforeEndMin = dto.reminderBeforeEndMin;
    if (dto.autoCheckoutGraceMin !== undefined) data.autoCheckoutGraceMin = dto.autoCheckoutGraceMin;
    if (dto.allowWalkIns !== undefined) data.allowWalkIns = dto.allowWalkIns;
    if (dto.hostClubId !== undefined) data.hostClubId = dto.hostClubId;
    if (dto.rsvpRequired !== undefined) data.mode = dto.rsvpRequired ? EventMode.RSVP : EventMode.NO_RSVP;

    return this.prisma.runWithClaims(claims, async (tx) => {
      const event = await tx.event.findFirst({
        where: {
          id: eventId,
          ...where
        }
      });

      if (!event) {
        throw new NotFoundException('Event not found');
      }

      return tx.event.update({
        where: { id: eventId },
        data
      });
    });
  }

  async extendEvent(user: SessionUser, eventId: string, dto: ExtendEventDto) {
    const scope = resolveRoleScope(user.roleAssignments);
    ensureAdminAccess(scope);
    const claims = buildClaims(user.id, scope, ['admin']);
    const where = resolveEventWhereClause(scope);

    if (dto.minutes > 60) {
      throw new BadRequestException('Extensions longer than 60 minutes require a new event');
    }

    return this.prisma.runWithClaims(claims, async (tx) => {
      const event = await tx.event.findFirst({
        where: {
          id: eventId,
          ...where
        }
      });

      if (!event) {
        throw new NotFoundException('Event not found');
      }

      const extendedEnd = addMinutes(event.endTime, dto.minutes);
      const updated = await tx.event.update({
        where: { id: eventId },
        data: {
          endTime: extendedEnd
        }
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'EVENT_EXTENDED',
          targetTable: 'Event',
          targetId: eventId,
          metadata: {
            previousEnd: event.endTime.toISOString(),
            newEnd: extendedEnd.toISOString(),
            reason: dto.reason
          }
        }
      });

      return updated;
    });
  }

  async getAdminEvents(user: SessionUser): Promise<AdminEventItem[]> {
    const scope = resolveRoleScope(user.roleAssignments);
    ensureAdminAccess(scope);
    const claims = buildClaims(user.id, scope, ['admin']);
    const where = resolveEventWhereClause(scope);

    const events = await this.prisma.runWithClaims(claims, (tx) =>
      tx.event.findMany({
        where,
        orderBy: {
          startTime: 'asc'
        }
      })
    );

    return events.map((event) => ({
      id: event.id,
      name: event.name,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      allowWalkIns: event.allowWalkIns,
      requireRsvp: event.mode === EventMode.RSVP,
      hostClubId: event.hostClubId,
      status: this.resolveMemberEventStatus(event, new Date())
    }));
  }

  async getAdminDashboard(user: SessionUser): Promise<AdminDashboard> {
    const scope = resolveRoleScope(user.roleAssignments);
    ensureAdminAccess(scope);
    const claims = buildClaims(user.id, scope, ['admin']);
    const where = resolveEventWhereClause(scope);
    const now = new Date();

    return this.prisma.runWithClaims(claims, async (tx) => {
      const [activeMembers, invitedMembers, activeSessions, upcomingEvents, upcomingList, pendingInvites] =
        await Promise.all([
          tx.user.count({ where: { status: 'ACTIVE' } }),
          tx.user.count({ where: { status: 'INVITED' } }),
          tx.attendanceSession.count({ where: { checkOutTs: null } }),
          tx.event.count({
            where: {
              ...where,
              startTime: {
                gt: now
              }
            }
          }),
          tx.event.findMany({
            where: {
              ...where,
              startTime: {
                gt: now
              }
            },
            orderBy: { startTime: 'asc' },
            take: 5
          }),
          tx.user.findMany({
            where: {
              status: 'INVITED'
            },
            select: {
              id: true,
              email: true,
              displayName: true
            }
          })
        ]);

      return {
        totals: {
          activeMembers,
          invitedMembers,
          activeSessions,
          upcomingEvents
        },
        upcoming: upcomingList.map((event) => ({
          id: event.id,
          name: event.name,
          startTime: event.startTime.toISOString(),
          endTime: event.endTime.toISOString(),
          allowWalkIns: event.allowWalkIns,
          requireRsvp: event.mode === EventMode.RSVP,
          hostClubId: event.hostClubId,
          status: this.resolveMemberEventStatus(event, now)
        })),
        pendingInvites
      };
    });
  }
}
