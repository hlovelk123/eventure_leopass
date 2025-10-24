# Eventure LeoPass Platform

Monorepo containing the NestJS API (`api/`) and React/Vite PWA (`web/`) for the Leo Sri Lanka QR attendance platform. Follow the phase plan in `plan_v1.2.md` and `codex-inputs.md` for scope and configuration details.

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- Docker & Docker Compose (v2)

### Install dependencies

```bash
npm install
```

### Local development

Start API and web app together:

```bash
npm run dev
```

- API: http://localhost:3000 (health: `/healthz`)
- Web: http://localhost:5173

### Quality checks

```bash
npm run lint
npm run test
npm run build
```

Run Playwright e2e smoke tests (install browsers once via `npx playwright install --with-deps`):

```bash
npm run e2e -- --project=chromium
```

### Docker Compose (dev profile)

```bash
docker compose --profile dev up --build
```

Services: Postgres, Redis, API (Nest dev), Web (Vite dev server).

## CI

GitHub Actions workflow at `.github/workflows/ci.yml` runs lint, typecheck, build, unit, and Playwright suites.

## Documentation

- `docs/security.md` – platform security baseline
- `docs/runbooks/` – placeholder for operational runbooks
- `SHIP_NOTES.md`, `RELEASE_CHECKLIST.md`, `SHIP_READY.md` – maintained per phase.

## Next Steps

Follow Phase 1 (Data Model & Auth) as described in `plan_v1.2.md`.
