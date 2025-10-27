# Eventure LeoPass Platform

Monorepo providing the NestJS API (`api/`) and React/Vite PWA (`web/`) for the Leo Sri Lanka QR attendance experience. Scope and non-functional requirements are defined in `plan_v1.2.md` (normative) and `codex-inputs.md` (configuration bindings).

## Phase 1 Highlights – Data Model & Auth

- **Prisma/PostgreSQL schema** covering core entities (`users`, `clubs`, `events`, `member_event_passes`, `attendance_sessions`, etc.) with row-level security policies and helper functions (`leopass.set_claims`) for contextual access.
- **NestJS modules** for configuration, Prisma access, and auth flows (OTP + WebAuthn) with Cloudflare Turnstile server-side verification and secure session cookies.
- **Email OTP service** using ZeptoMail API (logs to console in development when no API key is provided).
- **WebAuthn passkey registration & authentication** powered by `@simplewebauthn/server`, persisting challenges and credentials with replay protection.
- **React PWA auth screen** enabling email OTP sign-in, Turnstile widget integration, passkey registration, and passkey login via `@simplewebauthn/browser`.
- **Automated tests** (Jest + Vitest) covering Prisma-backed services (OTP + sessions) and basic UI rendering.

## Phase 5 Highlights – Notifications

- **Prisma notifications schema** (`Notification`, `NotificationDelivery`, `NotificationSubscription`, `UserNotificationPreference`) with row-level security restricting access to owners/system roles.
- **NestJS NotificationsModule** integrates BullMQ queues, `web-push` for VAPID-based delivery, and ZeptoMail email fallback (exponential retry + cleanup of stale endpoints).
- **Member experience** now consumes the real notification feed, supports “mark all read,” and exposes push/email toggles with browser permission prompts and IndexedDB offline fallback messaging.
- **Tooling**: new Jest coverage for notification service + processor flows, updated events specs/mocks, and `.env.example` now documents `WEB_PUSH_VAPID_*`, `ENABLE_PUSH_NOTIFICATIONS`, and `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`.

## Phase 6 Highlights – Reporting

- **Event reports API** surfaces scheduled vs actual timelines, overrun metrics, host club metadata, and ordered attendance category totals; CSV export runs in Asia/Colombo with member/guest detail.
- **Admin dashboard** adds a reporting panel with timeline/totals summary, category table, and recent attendee snapshot plus one-click CSV download wired to the new endpoints.
- **Quality guardrails**: Jest coverage validates reporting order + CSV content while the PWA lint/test suite exercises the refreshed admin UI.

## Prerequisites

- Node.js 20+
- npm 10+
- Docker & Docker Compose v2 (for Postgres/Redis when running locally)

## Installation

```bash
npm install
```

## Running Locally

### Option 1: Node processes

```bash
# start Postgres + Redis in the background (optional but recommended)
docker compose --profile dev up postgres redis -d

# start API and web dev servers concurrently
npm run dev
```

- API: http://localhost:3000 (health check: `/api/healthz`)
- Web: http://localhost:5173 (auth page at `/auth`)

Environment variables are loaded from `.env` (API) and `web/.env` (Vite). See `.env.example` for the complete template.

### Option 2: Docker Compose (dev profile)

```bash
docker compose --profile dev up --build
```

This starts Postgres, Redis, API (NestJS in watch mode), and Web (Vite dev server) with volume mounts.

## Quality Checks

```bash
npm run lint       # ESLint (API + Web)
npm run test       # Jest (API) + Vitest (Web)
npm run build      # tsc + Vite + Nest build
npm run verify:perf # Ensure main bundle <=300 KB gz (runs after build)
```

Playwright smoke tests (browsers must be installed once):

```bash
npx playwright install --with-deps
npm run e2e -- --project=chromium
```

## Key API Endpoints

| Method   | Endpoint                              | Description                                              |
| -------- | ------------------------------------- | -------------------------------------------------------- |
| `POST`   | `/api/auth/otp/request`               | Request email OTP (requires Turnstile token)             |
| `POST`   | `/api/auth/otp/verify`                | Verify OTP, create secure session cookie                 |
| `POST`   | `/api/auth/webauthn/register/options` | Get passkey registration options (session required)      |
| `POST`   | `/api/auth/webauthn/register/verify`  | Persist new passkey credential                           |
| `POST`   | `/api/auth/webauthn/login/options`    | Get passkey authentication options by email              |
| `POST`   | `/api/auth/webauthn/login/verify`     | Verify passkey assertion and sign in                     |
| `POST`   | `/api/auth/logout`                    | Invalidate current session                               |
| `GET`    | `/api/auth/session`                   | Return session user summary                              |
| `GET`    | `/api/member/events/:eventId/token`   | Issue rotating Ed25519 QR token for the member (30s TTL) |
| `POST`   | `/api/scan`                           | Steward scan endpoint (idempotent, enforces burn ledger) |
| `GET`    | `/api/.well-known/jwks.json`          | JWKS exposing active Ed25519 public keys                 |
| `GET`    | `/api/notifications`                  | Paginated notification feed for the signed-in user       |
| `PATCH`  | `/api/notifications/mark-all-read`    | Mark every unread notification as read                   |
| `GET`    | `/api/notifications/preferences`      | Retrieve push/email channel preferences                  |
| `PUT`    | `/api/notifications/preferences`      | Update push/email channel preferences                    |
| `POST`   | `/api/notifications/subscriptions`    | Register or refresh a web push subscription              |
| `DELETE` | `/api/notifications/subscriptions`    | Remove a web push subscription                           |

All requests that mutate auth state must include the Turnstile token (see `TurnstileWidget` for the front-end integration). Sessions are returned as `lp_session` HttpOnly cookies valid for 24h.

## Frontend Notes

- Vite is configured with Tailwind + shadcn/ui utility classes.
- Turnstile site key is read from `VITE_CF_TURNSTILE_SITE_KEY`.
- Member dashboard surfaces notification feed + preferences; push alerts require `WEB_PUSH_VAPID_PUBLIC_KEY` (API) and `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` (web) plus browser notification permission.
- Passkeys require a secure origin when deployed; during local dev Vite serves over HTTP with platform authenticator support (Chrome/Edge recommended).
- The PWA registers a Workbox service worker (`vite-plugin-pwa`) for asset caching and JWKS refresh; build before testing install/offline flows.
- Steward scanner (`/steward/scan`) validates tokens locally, queues scans in IndexedDB (≤500 entries, 48h TTL), and syncs automatically when back online.
- Member QR tokens live at `/member/events/:eventId/token`; rotating codes refresh every 30 seconds with manual refresh fallback.

## Tooling & CI

- GitHub Actions workflow `.github/workflows/ci.yml` runs lint, typecheck, build, unit tests, and Playwright suites on pushes/PRs.
- Prisma migrations live under `prisma/migrations`. Apply locally with `npx prisma migrate deploy` after setting `DATABASE_URL`.

## Operations & Hardening

- Global security headers (CSP, HSTS, referrer policy) enforced via Helmet in the NestJS bootstrap; configure trusted origin with `APP_URL`.
- Rate limiting enabled through `@nestjs/throttler` (defaults via `RATE_LIMIT_TTL`/`RATE_LIMIT_MAX`), with tighter caps on auth/token/scan endpoints.
- Backups and monitoring runbooks live under `docs/runbooks/` (`backups.md`, `monitoring.md`) covering nightly `pg_dump`, restore drills, SLOs, and alert routing.
- Production deploys should run behind Nginx/Cloudflare with HTTPS enforced; ensure Redis/Postgres credentials are rotated quarterly per security guidance.

## Documentation

- `docs/security.md` – security rationale (update as hardening continues)
- `docs/runbooks/` – runbook stubs for future phases
- `SHIP_NOTES.md`, `RELEASE_CHECKLIST.md`, `SHIP_READY.md` – phase-by-phase release artefacts

## Next Steps

- Continue Phase 6 (reporting), Phase 7 (hardening/SRE), and Phase 8 (E2E/a11y/perf) per `plan_v1.2.md`, teeing up the final release checklist.
- Expand automated coverage (Playwright suites, API contract tests) and prepare deployment/rollback runbooks ahead of Phase 9 tagging.
