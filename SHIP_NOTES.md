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

## Phase 2 – Token & Scan Flows

- _Pending_

## Phase 3 – Steward Offline & Sync

- _Pending_

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
