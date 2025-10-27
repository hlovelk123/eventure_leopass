# Ship Ready Checklist

Use this list to validate the release candidate before tagging `v1.0.0`.

- [ ] **Staging deploy** – `docker compose --profile prod up --build` on staging VM, load `.env` from secrets vault, run `npm run build` + migrations (`npx prisma migrate deploy`).
- [ ] **Smoke verification** – execute `npm run e2e -- --project=chromium` against staging URL, plus manual OTP + passkey sign-in, steward scan, admin reporting export.
- [ ] **Monitoring & alerts** – confirm Uptime Kuma monitors green, Sentry receiving events (test error), BullMQ queue dashboard healthy (no stuck jobs).
- [ ] **Backup & DR** – ensure nightly backup job succeeded (check Object Storage + SHIP_NOTES entry) and most recent restore drill timestamp <30 days (see `docs/runbooks/backups.md`).
- [ ] **Rollback plan** – document current container image/tag in incident log; rehearse `docker compose` rollback or database restore path in case of deploy failure.
- [ ] **Release approval** – capture sign-off from release captain & stakeholders, update SHIP_NOTES with decision and link to issue tracker entry.
