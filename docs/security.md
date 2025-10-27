# Security Overview

This document captures the evolving security posture of the Leo Pass platform. The items below reflect the current implementation status after Phase 7 (Hardening & SRE).

## Authentication & Session Controls

- Primary sign-in: WebAuthn passkeys with email OTP fallback (rate-limited) and Cloudflare Turnstile verification.
- Sessions issued as HttpOnly, SameSite=Lax cookies with 24h TTL; session rotation occurs on MFA actions and passkey registrations.
- Manual session revocation and device log management exposed through the SessionService.

## API Hardening

- NestJS global Helmet middleware enforces:
  - **CSP**: `default-src 'self'`, `connect-src` limited to the API origin + Cloudflare Turnstile, `frame-src` restricted to Turnstile, inline styles only for minimal responses.
  - **HSTS**: 1 year, includeSubDomains, preload (gate has to run behind TLS in production); trust proxy enabled for correct client IP detection.
  - **Referrer-Policy**: `strict-origin-when-cross-origin`.
  - Built-in X-Content-Type-Options, X-DNS-Prefetch-Control, Frameguard etc.
- CORS restricted to `APP_URL`; credentials required for session-based endpoints.
- API prefix `/api` is enforced; HTTP traffic expected to be terminated at Nginx with forced HTTPS redirect.

## Rate Limiting & Abuse Protection

- Global throttling powered by `@nestjs/throttler` with configurable defaults (`RATE_LIMIT_TTL`, `RATE_LIMIT_MAX`).
- Endpoint overrides:
  - `/api/auth/otp/*` & WebAuthn routes capped at 5–20 requests per minute to limit OTP/passkey enumeration.
  - `/api/member/events/:id/token` limited (30/min) to curb token scraping.
  - `/api/scan` allows higher throughput (150/min) while still protecting against automated replay.
- Throttling honours proxy headers and returns 429 responses with standard metadata; Redis-backed storage is planned when moving to multi-instance deployment.

## Data Protection & Monitoring

- PostgreSQL Row-Level Security guards tenant data (`leopass.set_claims`).
- Ed25519 rotating QR tokens (Phase 2) maintain single-use semantics with burn ledger.
- Daily database dumps scripted via `BACKUP_CRON` to S3-compatible storage (see `docs/runbooks/backups.md`).
- Observability targets:
  - API availability 99.9% monthly.
  - Scan endpoint latency p50 < 300 ms / p95 < 800 ms.
  - PWA JS bundle ≤ 300 KB gzipped, TTI ≤ 3.5 s on mid-tier Android.
- Uptime Kuma, Sentry, and BullMQ metrics dashboards defined in the monitoring runbook (Phase 7 output).

## Secret Management

- All sensitive configuration pulled from environment variables (`.env.example` kept in sync).
- Guidance for ZeptoMail, VAPID, Redis, and database credentials documented in README and runbooks; rotation cadence quarterly with break-glass procedure.

## Next Steps

- Add Redis-backed throttler storage before scaling out horizontally.
- Expand threat model and perform structured security review prior to release (Phase 9 ship gate).
