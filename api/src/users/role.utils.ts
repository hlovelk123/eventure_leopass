import { ForbiddenException } from '@nestjs/common';
import { RoleAssignment, RoleLevel } from '@prisma/client';
import type { PrismaClaims } from '../prisma/prisma.service.js';

export type RoleScope = {
  isSuperAdmin: boolean;
  districtIds: string[];
  clubAdminIds: string[];
  stewardClubIds: string[];
};

function normaliseTitle(title?: string | null): string {
  return title?.toLowerCase() ?? '';
}

export function resolveRoleScope(assignments: RoleAssignment[]): RoleScope {
  const scope: RoleScope = {
    isSuperAdmin: false,
    districtIds: [],
    clubAdminIds: [],
    stewardClubIds: []
  };

  for (const assignment of assignments) {
    const title = normaliseTitle(assignment.roleTitle);

    switch (assignment.level) {
      case RoleLevel.MULTIPLE_COUNCIL:
        scope.isSuperAdmin = true;
        break;
      case RoleLevel.DISTRICT:
        if (assignment.districtId) {
          scope.districtIds.push(assignment.districtId);
        }
        break;
      case RoleLevel.CLUB: {
        const clubId = assignment.clubId ?? undefined;
        if (!clubId) {
          break;
        }
        if (title.includes('steward') || title.includes('scanner')) {
          scope.stewardClubIds.push(clubId);
        } else {
          scope.clubAdminIds.push(clubId);
        }
        break;
      }
      default:
        break;
    }
  }

  return scope;
}

export function buildClaims(userId: string, scope: RoleScope, additionalRoles: string[] = []): PrismaClaims {
  const roles = new Set<string>(additionalRoles);
  if (scope.isSuperAdmin) {
    roles.add('super_admin');
  }
  if (scope.clubAdminIds.length > 0 || scope.districtIds.length > 0) {
    roles.add('admin');
  }
  if (scope.stewardClubIds.length > 0) {
    roles.add('steward');
  }

  const clubIds = new Set<string>([...scope.clubAdminIds, ...scope.stewardClubIds]);

  return {
    userId,
    roles: Array.from(roles),
    clubIds: Array.from(clubIds),
    districtIds: scope.districtIds
  };
}

export function ensureAdminAccess(scope: RoleScope): void {
  if (scope.isSuperAdmin || scope.clubAdminIds.length > 0 || scope.districtIds.length > 0) {
    return;
  }
  throw new ForbiddenException('Admin privileges required');
}

export function ensureStewardAccess(scope: RoleScope): void {
  if (scope.isSuperAdmin || scope.stewardClubIds.length > 0 || scope.clubAdminIds.length > 0) {
    return;
  }
  throw new ForbiddenException('Steward privileges required');
}

export function resolveAccessibleClubIds(scope: RoleScope): string[] | null {
  if (scope.isSuperAdmin) {
    return null;
  }
  return [...new Set([...scope.clubAdminIds, ...scope.stewardClubIds])];
}

export function resolveEventWhereClause(scope: RoleScope) {
  if (scope.isSuperAdmin) {
    return {};
  }

  const conditions: Record<string, unknown>[] = [];

  if (scope.districtIds.length > 0) {
    conditions.push({ hostClub: { districtId: { in: scope.districtIds } } });
  }

  if (scope.clubAdminIds.length > 0) {
    conditions.push({ hostClubId: { in: scope.clubAdminIds } });
  }

  if (scope.stewardClubIds.length > 0) {
    conditions.push({ hostClubId: { in: scope.stewardClubIds } });
  }

  if (conditions.length === 0) {
    // No clubs/districts configured; return a predicate that yields no results.
    return { id: '__no_access__' };
  }

  return { OR: conditions };
}
