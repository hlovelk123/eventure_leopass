# Monitoring & Alerting Playbook

## Service Level Objectives (SLOs)

| Metric                  | Target                     | Notes                                                                            |
| ----------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| API availability        | 99.9% monthly              | HTTP 5xx / connection errors captured via Uptime Kuma + Sentry                   |
| `/api/scan` latency     | p50 < 300 ms, p95 < 800 ms | Measured via Nginx + application metrics; alert when burn rate exceeds 2× budget |
| Notification queue time | < 30 s average             | BullMQ metrics exported to Grafana panel                                         |
| PWA bundle size         | ≤ 300 KB gzipped           | Enforced during CI build phase                                                   |

Error budget policy: two consecutive burn alerts trigger feature freeze until remediated.

## Telemetry Stack

- **Uptime Kuma**: HTTP health checks for API `/api/healthz`, worker queue heartbeat, and Postgres TCP checks.
- **Sentry**: Frontend + backend error tracking (DSNs in environment). Configure issue alert for auth/scan errors > 5/min.
- **BullMQ metrics**: expose `/api/queues/metrics` (future) or use `bull-board` in read-only mode for queue depth.
- **Node exporter / Prometheus** (optional): CPU, memory, disk trending for VM.

## Alert Routing

| Condition                         | Threshold                  | Action                                              |
| --------------------------------- | -------------------------- | --------------------------------------------------- |
| API 5xx rate > 2% for 5 min       | PagerDuty / Ops Slack ping | Investigate recent deploy, roll back if necessary   |
| Scan latency p95 > 1 s for 10 min | Slack `#stewards`          | Check Redis/Postgres health, evaluate queue backlog |
| Nightly backup failure            | Immediate Ops Slack ping   | Re-run backup job, log in SHIP_NOTES                |
| Redis memory > 80%                | PagerDuty low priority     | Flush processed jobs, scale resources               |

## Incident Response Flow

1. Acknowledge alert (PagerDuty or Slack) within 5 minutes.
2. Create temporary incident channel (Slack) and assign communicator + responder roles.
3. Capture context: recent deploys, infrastructure changes, external outages.
4. Mitigate (rollback, scale, feature-flag off). Document steps in shared notes.
5. Once resolved, close alerts and update SHIP_NOTES with timeline + follow-ups.
6. Schedule RCA within 48 hours for Sev-1/Sev-2 incidents.

## Dashboards

- **Operations (Grafana)**: availability, latency, queue depth, CPU/memory, free disk.
- **Notifications**: deliveries per channel, failure rate, time-to-send.
- **Auth**: OTP request volume, Turnstile failures, throttled requests.

## Maintenance Cadence

- **Daily**: review overnight alerts, verify backups (checksum + object).
- **Weekly**: check BullMQ retry queue, ensure no stuck jobs; review SLO burn rate.
- **Monthly**: Staging restore drill (see `backups.md`) + security patch review.
- **Quarterly**: DR exercise including DNS failover and Redis persistence validation.

## References

- `docs/security.md` for current hardening configuration.
- `docs/runbooks/backups.md` for backup/restore procedure.
- SHIP_NOTES Phase 7 section for recent upgrades and pending actions.
