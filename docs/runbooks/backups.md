# Database Backups & Restore Drill

## Objectives

- Guarantee daily encrypted backups for the production PostgreSQL database.
- Provide a tested restoration workflow (target RPO ≤ 24h, RTO ≤ 2h).

## Nightly Backup Job

| Item      | Value                                                                            |
| --------- | -------------------------------------------------------------------------------- |
| Schedule  | `${BACKUP_CRON}` (defaults to `0 2 * * *`)                                       |
| Command   | `pg_dump --format=custom --file=/backups/leopass-$(date +%F).dump $DATABASE_URL` |
| Storage   | Oracle Cloud Object Storage (S3-compatible) bucket `${OCI_BUCKET}`               |
| Retention | 30 days rolling (older objects pruned nightly)                                   |

1. Docker Compose profile `prod` mounts `/var/opt/leopass/backups` for the API container.
2. Cron container executes the dump, gzips, and uploads using the configured OCI credentials.
3. Upload verification: checksum compared against remote `ETag`; failures alert through Ops channel and Sentry breadcrumb.

## Restore Runbook

> Perform in staging monthly; treat every production incident as time-sensitive. Target completion ≤ 2 hours.

1. **Quarantine traffic**: disable public ingress (Cloudflare maintenance page / WAF rule) and pause background workers.
2. **Provision database**: deploy fresh Postgres instance or clean down existing cluster.
3. **Download artefact**: fetch required dump from Object Storage, verify checksum.
4. **Restore**:
   ```bash
   createdb leopass_restore
   pg_restore --clean --if-exists --dbname=leopass_restore /path/to/leopass-YYYY-MM-DD.dump
   ```
5. **Run migrations**: `DATABASE_URL=postgresql://... npx prisma migrate deploy`.
6. **Reconfigure services**: point Prisma connection string at restored instance, rotate credentials if compromise suspected.
7. **Validation**: execute smoke tests (`npm run test --workspace @eventure-leopass/api`, `npm run test --workspace @eventure-leopass/web`) and manual scan/auth flow checks.
8. **Reopen traffic**: lift maintenance page, resume workers.
9. **Post-mortem**: log event in SHIP_NOTES + incident tracker, file follow-up tasks.

## Verification Cadence

- **Monthly**: staging restore drill, recorded in SHIP_NOTES with timing metrics.
- **Quarterly**: full disaster-recovery rehearsal (infrastructure + DNS failover).
- **Alerts**: backup job publishes success/failure metrics to Uptime Kuma; failures also trigger Sentry error.

## Troubleshooting

- Permission errors uploading to OCI → rotate `${OCI_S3_ACCESS_KEY}` / `${OCI_S3_SECRET_KEY}` and re-run job.
- Long-running dump (>30 minutes) → check table bloat; consider enabling `pg_compress` and incremental backups.
- Restore schema mismatch → ensure the dump corresponds to the same commit; run `prisma migrate diff` if manual adjustments are needed.
