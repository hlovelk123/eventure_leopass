-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RoleLevel" AS ENUM ('MULTIPLE_COUNCIL', 'DISTRICT', 'CLUB');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventMode" AS ENUM ('NO_RSVP', 'RSVP');

-- CreateEnum
CREATE TYPE "MemberEventPassStatus" AS ENUM ('PROVISIONED', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('STEWARD', 'MANUAL');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('INVITED', 'REGISTERED', 'APPROVED', 'WAITLISTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('SIGN_IN', 'STEP_UP', 'RECOVERY');

-- CreateEnum
CREATE TYPE "OtpChallengeStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationPreference" AS ENUM ('ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('INVITED_GUESTS', 'LIONS', 'MULTIPLE_COUNCIL_OFFICERS', 'DISTRICT_COUNCIL_OFFICERS', 'CLUB_EXECUTIVE_OFFICERS', 'CLUB_MEMBERS', 'VISITING_LEOS', 'OUTSIDERS');

-- CreateTable
CREATE TABLE "District" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "districtId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "locale" TEXT DEFAULT 'en-LK',
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "primaryClubId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "level" "RoleLevel" NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "districtId" UUID,
    "clubId" UUID,
    "startTs" TIMESTAMP(3) NOT NULL,
    "endTs" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebauthnCredential" (
    "credentialId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "publicKey" TEXT NOT NULL,
    "signCount" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "deviceLabel" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebauthnCredential_pkey" PRIMARY KEY ("credentialId")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "webauthnCredentialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "replacedBySessionId" UUID,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOtpChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeSalt" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "OtpChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "turnstileToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "mode" "EventMode" NOT NULL DEFAULT 'NO_RSVP',
    "hostClubId" UUID,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "geofenceRadiusM" INTEGER DEFAULT 100,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationGeoJson" TEXT,
    "capacity" INTEGER,
    "reminderBeforeEndMin" INTEGER DEFAULT 10,
    "autoCheckoutGraceMin" INTEGER DEFAULT 5,
    "allowWalkIns" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventHostClub" (
    "eventId" UUID NOT NULL,
    "clubId" UUID NOT NULL,

    CONSTRAINT "EventHostClub_pkey" PRIMARY KEY ("eventId","clubId")
);

-- CreateTable
CREATE TABLE "MemberEventPass" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "MemberEventPassStatus" NOT NULL DEFAULT 'PROVISIONED',
    "provisionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberEventPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanToken" (
    "jti" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "notBefore" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByScannerId" TEXT,
    "signatureKid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "burnType" TEXT NOT NULL DEFAULT 'member',

    CONSTRAINT "ScanToken_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "AttendanceSession" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID,
    "invitedGuestId" UUID,
    "checkInTs" TIMESTAMP(3),
    "checkInLocOk" BOOLEAN DEFAULT true,
    "checkOutTs" TIMESTAMP(3),
    "checkOutLocOk" BOOLEAN DEFAULT true,
    "method" "AttendanceMethod" NOT NULL DEFAULT 'STEWARD',
    "scannerDeviceId" TEXT,
    "reportCategory" "ReportCategory" NOT NULL DEFAULT 'CLUB_MEMBERS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rsvp" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "RsvpStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rsvp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannerDevice" (
    "id" TEXT NOT NULL,
    "stewardUserId" UUID NOT NULL,
    "userAgentHash" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScannerDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "locale" TEXT DEFAULT 'en-LK',

    CONSTRAINT "NotificationSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "preference" "NotificationPreference" NOT NULL DEFAULT 'ENABLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitedGuestEventAttendee" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "type" TEXT NOT NULL,
    "createdByStewardId" UUID,
    "checkInTime" TIMESTAMP(3),
    "checkInLocOk" BOOLEAN DEFAULT true,
    "checkOutTime" TIMESTAMP(3),
    "checkOutLocOk" BOOLEAN DEFAULT true,
    "method" "AttendanceMethod" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "mergedUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvitedGuestEventAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitedGuestPassToken" (
    "jti" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "guestAttendeeId" UUID NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByScannerId" TEXT,
    "signatureKid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitedGuestPassToken_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "targetTable" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "District_code_key" ON "District"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Club_code_key" ON "Club"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_primaryClubId_idx" ON "User"("primaryClubId");

-- CreateIndex
CREATE INDEX "RoleAssignment_districtId_idx" ON "RoleAssignment"("districtId");

-- CreateIndex
CREATE INDEX "RoleAssignment_clubId_idx" ON "RoleAssignment"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_sessionTokenHash_key" ON "AuthSession"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "EmailOtpChallenge_userId_purpose_status_idx" ON "EmailOtpChallenge"("userId", "purpose", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MemberEventPass_eventId_userId_key" ON "MemberEventPass"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Rsvp_eventId_userId_key" ON "Rsvp"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSubscription_userId_endpoint_key" ON "NotificationSubscription"("userId", "endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationPreference_userId_channel_key" ON "UserNotificationPreference"("userId", "channel");

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_primaryClubId_fkey" FOREIGN KEY ("primaryClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebauthnCredential" ADD CONSTRAINT "WebauthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_webauthnCredentialId_fkey" FOREIGN KEY ("webauthnCredentialId") REFERENCES "WebauthnCredential"("credentialId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOtpChallenge" ADD CONSTRAINT "EmailOtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_hostClubId_fkey" FOREIGN KEY ("hostClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventHostClub" ADD CONSTRAINT "EventHostClub_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventHostClub" ADD CONSTRAINT "EventHostClub_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberEventPass" ADD CONSTRAINT "MemberEventPass_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberEventPass" ADD CONSTRAINT "MemberEventPass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanToken" ADD CONSTRAINT "ScanToken_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanToken" ADD CONSTRAINT "ScanToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_invitedGuestId_fkey" FOREIGN KEY ("invitedGuestId") REFERENCES "InvitedGuestEventAttendee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_scannerDeviceId_fkey" FOREIGN KEY ("scannerDeviceId") REFERENCES "ScannerDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rsvp" ADD CONSTRAINT "Rsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rsvp" ADD CONSTRAINT "Rsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScannerDevice" ADD CONSTRAINT "ScannerDevice_stewardUserId_fkey" FOREIGN KEY ("stewardUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSubscription" ADD CONSTRAINT "NotificationSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitedGuestEventAttendee" ADD CONSTRAINT "InvitedGuestEventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitedGuestEventAttendee" ADD CONSTRAINT "InvitedGuestEventAttendee_createdByStewardId_fkey" FOREIGN KEY ("createdByStewardId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitedGuestEventAttendee" ADD CONSTRAINT "InvitedGuestEventAttendee_mergedUserId_fkey" FOREIGN KEY ("mergedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitedGuestPassToken" ADD CONSTRAINT "InvitedGuestPassToken_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitedGuestPassToken" ADD CONSTRAINT "InvitedGuestPassToken_guestAttendeeId_fkey" FOREIGN KEY ("guestAttendeeId") REFERENCES "InvitedGuestEventAttendee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Security schema helpers
CREATE SCHEMA IF NOT EXISTS leopass;

CREATE OR REPLACE FUNCTION leopass.set_claims(
  p_user_id uuid,
  p_club_ids uuid[],
  p_district_ids uuid[],
  p_roles text[]
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('leopass.claim.user_id', COALESCE(p_user_id::text, ''), true);
  PERFORM set_config('leopass.claim.club_ids', COALESCE(array_to_string(p_club_ids, ','), ''), true);
  PERFORM set_config('leopass.claim.district_ids', COALESCE(array_to_string(p_district_ids, ','), ''), true);
  PERFORM set_config('leopass.claim.roles', COALESCE(array_to_string(p_roles, ','), ''), true);
END;
$$;

CREATE OR REPLACE FUNCTION leopass.current_user_id()
RETURNS uuid LANGUAGE sql AS $$
  SELECT NULLIF(current_setting('leopass.claim.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION leopass.role_array()
RETURNS text[] LANGUAGE sql AS $$
  SELECT COALESCE(string_to_array(NULLIF(current_setting('leopass.claim.roles', true), ''), ','), ARRAY[]::text[]);
$$;

CREATE OR REPLACE FUNCTION leopass.has_role(p_role text)
RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(leopass.role_array()) role
    WHERE upper(role) = upper(p_role)
  );
$$;

CREATE OR REPLACE FUNCTION leopass.club_array()
RETURNS text[] LANGUAGE sql AS $$
  SELECT COALESCE(string_to_array(NULLIF(current_setting('leopass.claim.club_ids', true), ''), ','), ARRAY[]::text[]);
$$;

CREATE OR REPLACE FUNCTION leopass.has_club(p_club uuid)
RETURNS boolean LANGUAGE sql AS $$
  SELECT p_club::text = ANY(leopass.club_array());
$$;

-- Enable Row Level Security and baseline policies
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_self_or_system" ON "User"
  USING (leopass.has_role('system') OR "id" = leopass.current_user_id())
  WITH CHECK (leopass.has_role('system') OR "id" = leopass.current_user_id());

ALTER TABLE "RoleAssignment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_assignment_read" ON "RoleAssignment"
  FOR SELECT USING (
    leopass.has_role('system')
    OR "userId" = leopass.current_user_id()
    OR ("clubId" IS NOT NULL AND leopass.has_club("clubId"))
  );
CREATE POLICY "role_assignment_write" ON "RoleAssignment"
  FOR ALL USING (leopass.has_role('system')) WITH CHECK (leopass.has_role('system'));

ALTER TABLE "WebauthnCredential" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credential_owner_or_system" ON "WebauthnCredential"
  USING (leopass.has_role('system') OR "userId" = leopass.current_user_id())
  WITH CHECK (leopass.has_role('system') OR "userId" = leopass.current_user_id());

ALTER TABLE "AuthSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "session_owner_or_system" ON "AuthSession"
  USING (leopass.has_role('system') OR "userId" = leopass.current_user_id())
  WITH CHECK (leopass.has_role('system') OR "userId" = leopass.current_user_id());

ALTER TABLE "EmailOtpChallenge" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "otp_owner_or_system" ON "EmailOtpChallenge"
  USING (leopass.has_role('system') OR "userId" = leopass.current_user_id())
  WITH CHECK (leopass.has_role('system') OR "userId" = leopass.current_user_id());

ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_system_only" ON "Event" USING (leopass.has_role('system')) WITH CHECK (leopass.has_role('system'));

ALTER TABLE "EventHostClub" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_host_club_system_only" ON "EventHostClub" USING (leopass.has_role('system')) WITH CHECK (leopass.has_role('system'));

ALTER TABLE "MemberEventPass" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_pass_owner_or_system" ON "MemberEventPass"
  USING (leopass.has_role('system') OR "userId" = leopass.current_user_id())
  WITH CHECK (leopass.has_role('system') OR "userId" = leopass.current_user_id());

ALTER TABLE "ScanToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scan_token_system_only" ON "ScanToken" USING (leopass.has_role('system')) WITH CHECK (leopass.has_role('system'));

ALTER TABLE "AttendanceSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_system_only" ON "AttendanceSession" USING (leopass.has_role('system')) WITH CHECK (leopass.has_role('system'));

ALTER TABLE "Rsvp" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rsvp_owner_or_system" ON "Rsvp"
  USING (leopass.has_role('system') OR "userId" = leopass.current_user_id())
  WITH CHECK (leopass.has_role('system') OR "userId" = leopass.current_user_id());

ALTER TABLE "ScannerDevice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scanner_device_owner_or_system" ON "ScannerDevice"
  USING (leopass.has_role('system') OR "stewardUserId" = leopass.current_user_id())
  WITH CHECK (leopass.has_role('system') OR "stewardUserId" = leopass.current_user_id());

ALTER TABLE "NotificationSubscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscription_owner_or_system" ON "NotificationSubscription"
  USING (leopass.has_role('system') OR "userId" = leopass.current_user_id())
  WITH CHECK (leopass.has_role('system') OR "userId" = leopass.current_user_id());

ALTER TABLE "UserNotificationPreference" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_pref_owner_or_system" ON "UserNotificationPreference"
  USING (leopass.has_role('system') OR "userId" = leopass.current_user_id())
  WITH CHECK (leopass.has_role('system') OR "userId" = leopass.current_user_id());

ALTER TABLE "InvitedGuestEventAttendee" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invited_guest_system_only" ON "InvitedGuestEventAttendee" USING (leopass.has_role('system')) WITH CHECK (leopass.has_role('system'));

ALTER TABLE "InvitedGuestPassToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guest_pass_token_system_only" ON "InvitedGuestPassToken" USING (leopass.has_role('system')) WITH CHECK (leopass.has_role('system'));

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_system_only" ON "AuditLog" USING (leopass.has_role('system')) WITH CHECK (leopass.has_role('system'));

ALTER TABLE "AppConfig" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_config_system_only" ON "AppConfig" USING (leopass.has_role('system')) WITH CHECK (leopass.has_role('system'));
