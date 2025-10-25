# Ship Notes

Document key decisions, external references, and verification evidence per phase.

## Phase 0 – Bootstrap & CI

- Established Node 20 monorepo (NestJS API + Vite PWA) with shared tooling (ESLint flat config, Prettier, Husky + lint-staged).
- Added Dockerfiles, docker-compose profiles (dev/staging/prod), GitHub Actions CI, and `.env.example` seeded from codex inputs.
- Verified lint, unit tests, web vitest, and build; Playwright smoke configured (browser binaries install requires elevated environment access).

## Phase 1 – Data Model & Auth

- Defined Prisma schema + migrations (users, clubs, events, passes, sessions, invites) with helper functions (`leopass.set_claims`) and RLS policies to isolate tenant data.
- Added NestJS `AuthModule` covering OTP + WebAuthn flows, secure session cookies, and Cloudflare Turnstile verification (`turnstile.service.ts`).
- Implemented ZeptoMail email adapter (API mode) for OTP delivery with development logging fallback. Reference: https://www.zoho.com/zeptomail/help/api/send-email.html.
- Integrated `@simplewebauthn/server` for passkey registration/authentication with persisted challenges and credential burn ledger updates. Reference: https://simplewebauthn.dev/docs/server.
- Normalized WebAuthn credential encoding (base64url → Uint8Array) to satisfy Nest build output and avoid SharedArrayBuffer typing issues.
- React `/auth` route provides Turnstile widget, OTP login UI, and passkey registration/authentication using `@simplewebauthn/browser`.
- Verified lint, unit, and build steps across API and web workspaces.
- Refreshed Playwright browser binaries (`npx playwright install chromium firefox webkit`) ensuring future e2e runs.
- Added Jest coverage for OTP & session services (real Postgres) and Vitest coverage for routing entry point.
- CI pipeline now provisions Postgres 16 and applies Prisma migrations before running tests.
- Hardened OTP verification against cross-account reuse by binding challenges to their issuing user and added regression tests for the bypass scenario.

## Phase 2 – Token & Scan Flows

- Added `TokenSigningKey` table with status lifecycle and Prisma ledger columns for scan tokens (idempotency key, attendance linkage).
- Implemented Nest token services: Ed25519 signer with JWKS endpoint and member token issuance API guarded by sessions.
- Added scan processing service/controller enforcing ±90s skew, event window, pass status, and idempotent check-in/out transitions.
- Created Jest coverage for signer, token issuance, and scan flows (including idempotent retries and checkout path) running against Postgres/Redis in Docker.
- React PWA now exposes member QR pages with auto-rotating tokens and a steward camera scanner with ZXing + idempotent submissions.
- API helper supports custom headers for scans; Vitest coverage asserts navigation to new member/steward routes.

## Phase 3 – Steward Offline & Sync

- Added Workbox-powered PWA setup (vite-plugin-pwa) caching static assets and JWKS with 6h refresh cadence.
- Steward scanner performs local Ed25519 verification using cached JWKS and queues scans to IndexedDB (≤500 entries, 48h TTL) when offline.
- IndexedDB queue auto-syncs when connectivity returns; UI surfaces offline badge, queued counts, and manual sync triggers.
- Service worker + hooks instrument offline banners and member QR routes to surface rotating tokens even with transient network loss.

## Phase 4 – Member/Steward/Admin UX

- _Pending_

## Phase 5 – Notifications

- _Pending_

## Phase 6 – Reporting

- _Pending_

## Phase 7 – Hardening & SRE

- _Pending_

## Phase 8 – E2E, A11y, Performance

- _Pending_

## Phase 9 – Release

- _Pending_
