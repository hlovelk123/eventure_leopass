# Eventure LeoPass Platform

Monorepo providing the NestJS API (`api/`) and React/Vite PWA (`web/`) for the Leo Sri Lanka QR attendance experience. Scope and non-functional requirements are defined in `plan_v1.2.md` (normative) and `codex-inputs.md` (configuration bindings).

## Phase 1 Highlights – Data Model & Auth

- **Prisma/PostgreSQL schema** covering core entities (`users`, `clubs`, `events`, `member_event_passes`, `attendance_sessions`, etc.) with row-level security policies and helper functions (`leopass.set_claims`) for contextual access.
- **NestJS modules** for configuration, Prisma access, and auth flows (OTP + WebAuthn) with Cloudflare Turnstile server-side verification and secure session cookies.
- **Email OTP service** using ZeptoMail API (logs to console in development when no API key is provided).
- **WebAuthn passkey registration & authentication** powered by `@simplewebauthn/server`, persisting challenges and credentials with replay protection.
- **React PWA auth screen** enabling email OTP sign-in, Turnstile widget integration, passkey registration, and passkey login via `@simplewebauthn/browser`.
- **Automated tests** (Jest + Vitest) covering Prisma-backed services (OTP + sessions) and basic UI rendering.

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
```

Playwright smoke tests (browsers must be installed once):

```bash
npx playwright install --with-deps
npm run e2e -- --project=chromium
```

## Key API Endpoints (Phase 1)

| Method | Endpoint                              | Description                                              |
| ------ | ------------------------------------- | -------------------------------------------------------- |
| `POST` | `/api/auth/otp/request`               | Request email OTP (requires Turnstile token)             |
| `POST` | `/api/auth/otp/verify`                | Verify OTP, create secure session cookie                 |
| `POST` | `/api/auth/webauthn/register/options` | Get passkey registration options (session required)      |
| `POST` | `/api/auth/webauthn/register/verify`  | Persist new passkey credential                           |
| `POST` | `/api/auth/webauthn/login/options`    | Get passkey authentication options by email              |
| `POST` | `/api/auth/webauthn/login/verify`     | Verify passkey assertion and sign in                     |
| `POST` | `/api/auth/logout`                    | Invalidate current session                               |
| `GET`  | `/api/auth/session`                   | Return session user summary                              |
| `GET`  | `/api/member/events/:eventId/token`   | Issue rotating Ed25519 QR token for the member (30s TTL) |
| `POST` | `/api/scan`                           | Steward scan endpoint (idempotent, enforces burn ledger) |
| `GET`  | `/api/.well-known/jwks.json`          | JWKS exposing active Ed25519 public keys                 |

All requests that mutate auth state must include the Turnstile token (see `TurnstileWidget` for the front-end integration). Sessions are returned as `lp_session` HttpOnly cookies valid for 24h.

## Frontend Notes

- Vite is configured with Tailwind + shadcn/ui utility classes.
- Turnstile site key is read from `VITE_CF_TURNSTILE_SITE_KEY`.
- Passkeys require a secure origin when deployed; during local dev Vite serves over HTTP with platform authenticator support (Chrome/Edge recommended).
- Member QR tokens available at `/member` → `/member/events/:eventId/token`; steward camera scanner lives at `/steward/scan` powered by ZXing.

## Tooling & CI

- GitHub Actions workflow `.github/workflows/ci.yml` runs lint, typecheck, build, unit tests, and Playwright suites on pushes/PRs.
- Prisma migrations live under `prisma/migrations`. Apply locally with `npx prisma migrate deploy` after setting `DATABASE_URL`.

## Documentation

- `docs/security.md` – security rationale (update as hardening continues)
- `docs/runbooks/` – runbook stubs for future phases
- `SHIP_NOTES.md`, `RELEASE_CHECKLIST.md`, `SHIP_READY.md` – phase-by-phase release artefacts

## Next Steps

- Complete remaining phases in `plan_v1.2.md` starting with Phase 2 (Token/Scan flows).
- Expand automated coverage (Playwright + API contracts) and begin integrating notifications and reporting once corresponding phases start.
