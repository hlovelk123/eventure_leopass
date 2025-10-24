-- CreateEnum
CREATE TYPE "WebauthnChallengeType" AS ENUM ('REGISTRATION', 'AUTHENTICATION');

-- CreateTable
CREATE TABLE "WebauthnChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "type" "WebauthnChallengeType" NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "WebauthnChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebauthnChallenge_userId_type_idx" ON "WebauthnChallenge"("userId", "type");

-- AddForeignKey
ALTER TABLE "WebauthnChallenge" ADD CONSTRAINT "WebauthnChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WebauthnChallenge" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webauthn_challenge_system_only" ON "WebauthnChallenge"
  USING (leopass.has_role('system')) WITH CHECK (leopass.has_role('system'));
