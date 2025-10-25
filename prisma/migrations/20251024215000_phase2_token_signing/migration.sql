-- CreateEnum
CREATE TYPE "TokenSigningKeyStatus" AS ENUM ('ACTIVE', 'ROTATING', 'RETIRED');

-- CreateTable
CREATE TABLE "TokenSigningKey" (
    "kid" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "status" "TokenSigningKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "TokenSigningKey_pkey" PRIMARY KEY ("kid")
);

-- AlterTable
ALTER TABLE "ScanToken" ADD COLUMN "attendanceSessionId" UUID;
ALTER TABLE "ScanToken" ADD COLUMN "consumedIdempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ScanToken_consumedIdempotencyKey_key" ON "ScanToken"("consumedIdempotencyKey");

-- AddForeignKey
ALTER TABLE "ScanToken" ADD CONSTRAINT "ScanToken_signatureKid_fkey" FOREIGN KEY ("signatureKid") REFERENCES "TokenSigningKey"("kid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanToken" ADD CONSTRAINT "ScanToken_attendanceSessionId_fkey" FOREIGN KEY ("attendanceSessionId") REFERENCES "AttendanceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitedGuestPassToken" ADD CONSTRAINT "InvitedGuestPassToken_signatureKid_fkey" FOREIGN KEY ("signatureKid") REFERENCES "TokenSigningKey"("kid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS and policy for new table
ALTER TABLE "TokenSigningKey" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "token_signing_key_system_only" ON "TokenSigningKey"
  USING (leopass.has_role('system'))
  WITH CHECK (leopass.has_role('system'));
