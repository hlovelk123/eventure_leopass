# Repository Guidelines

## Project Structure & Module Organization

- `api/`: NestJS backend (auth, Prisma, BullMQ, config). Tests live in `api/src/**/__tests__`.
- `web/`: React/Vite PWA with Tailwind + shadcn/ui. Routes under `web/src/routes`, components in `web/src/components`.
- `prisma/`: Database schema, migrations (`prisma/migrations/*`), and seed helpers.
- `docs/`: Operational guides (`docs/runbooks/`), security notes, and release artifacts.
- Root tooling includes shared ESLint/Prettier config, Docker Compose, and CI workflows in `.github/workflows/`.

## Build, Test, and Development Commands

- `npm install` / `npm ci`: install all workspaces.
- `npm run dev --workspace @eventure-leopass/web`: start the PWA at http://localhost:5173.
- `npm run start:dev --workspace @eventure-leopass/api`: run NestJS API with live reload.
- `npm run build`: builds API (Nest) and web (Vite) bundles.
- `npm run lint` / `npm run lint --workspace <pkg>`: run ESLint flat config.
- `npm run test --workspace @eventure-leopass/api`: Jest unit/integration suite (requires Postgres and Redis).
- `npm run test --workspace @eventure-leopass/web`: Vitest component/unit suite.
- `npm run e2e`: Playwright smoke tests; ensure `npx playwright install chromium firefox webkit`.

## Coding Style & Naming Conventions

- TypeScript everywhere; keep files in ESM with `.ts` extensions.
- Follow ESLint + Prettier auto-formatting (2-space indent). Run `npm run lint` before commits.
- Use descriptive function names (`getEventAttendees`) and PascalCase for classes/services.
- Environment variables validated via `api/src/config/env.validation.ts`; update `.env.example` when adding new ones.

## Testing Guidelines

- Jest (API) + Vitest (web) + Playwright (end-to-end, a11y/perf). Maintain ≥90% coverage on auth/token/scan modules.
- Place Jest specs beside implementation in `__tests__` folders; Playwright specs reside in `tests/e2e`.
- Use deterministic seeds and clean up database records created during tests.
- CI spins up Postgres automatically; run `npx prisma migrate deploy` before local Jest runs.

## Commit & Pull Request Guidelines

- Use Conventional Commits (`feat(auth): add WebAuthn challenge checks`, `fix(ci): provision Postgres`). One logical change per commit.
- Develop on milestone branches `feat/phase-N-<slug>`; rebase onto `main` when ready.
- PRs must describe scope, verification commands, and link to issue/plan section. Include screenshots or terminal captures for UX changes.
- Ensure SHIP_NOTES.md, RELEASE_CHECKLIST.md, and SHIP_READY.md stay current before requesting review.

## Security & Configuration Tips

- Never commit secrets. Populate env vars via `.env` copied from `.env.example`.
- Turnstile keys (`CF_TURNSTILE_*`) and signing keys must be present in CI/CD secrets before deploys.
- All database writes should go through `prisma.runWithClaims` to satisfy Row-Level Security policies.
