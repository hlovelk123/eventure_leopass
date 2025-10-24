# Leo Sri Lanka – QR Attendance (Full Plan v1.2)

> **Updated:** 2025-10-22 — Consolidated QA, fixed schema, unified clock-skew (±90 s), offline freshness gate, capacity semantics, RBAC matrix, CSP & backup rotation.
>
> - Fixed typos (e.g., “Acess” → “Access”), normalized role naming, removed duplicate bullets.
> - Standardized backend to **NestJS** (removed FastAPI options).
> - Added: JWKS offline rotation, clock‑skew tolerance, location spoofing checks, Admin MFA & rate limits.
> - API envelope + idempotency; rate‑limit headers; Web Push deletion.
> - SRE budgets (TTI/JS size; p50/p95), SLOs, secrets rotation, headers, DR drills.
> - Privacy (PDPA 30‑day SLA; guest data minimization), reporting timezone stamps & schedule‑drift columns.
> - UX rationale for geofence/time windows; abuse‑guards for schedule drift; device/accessibility specifics.
> - Roadmap buffer week + adoption metrics; budget contingency.

_Last updated: 25 Sep 2025 · Owner: Lasiru Lakruwan_

---

## Working Agreement

- **Scope:** deliver the steward-scanned QR attendance platform described below, covering NestJS API, React/Vite PWA, rotating token service, offline steward workflows, reminders/auto-check‑out jobs, reporting, and VM-based deployment tooling.
- **Non-goals:** native mobile apps, payments/billing, deep analytics beyond dashboards listed, non-Leo multi-tenant expansion, and bespoke integrations outside ZeptoMail (transactional) and Zoho Campaigns (bulk)/Turnstile/Postgres/Redis in this release.
- **Quality bar:** lint/type/test/build must be green in CI; ≥90% coverage on core auth/token/scan flows; accessibility axe checks with no blocking WCAG 2.1 issues on critical screens; Lighthouse PWA performance ≥85; security review of auth/offline flows; secrets managed via env vars with `.env.example` parity.
- **Exit criteria:** Production-Ready Gate satisfied (docs/audit high/critical closed or accepted, plan milestones complete, `task.md` backlog cleared or deferred with rationale, monitoring + alerts documented, reproducible Docker images, deployment runbooks validated, security/privacy review captured in `docs/security.md`, ship checklist checked off).

#### Roadmap & Success Criteria Updates (2025-10-22)

- **UAT buffer.** Insert a **buffer week** for a11y/Lighthouse fixes before “Production Readiness & Release.”
- **Adoption metrics.** Within first 90 days: **≥ 80%** of stewards complete training; **< 5%** of scans require manual override.
- **Budget contingency.** Add **one‑time setup** (domain, branding) and a **10–15%** contingency.

## Roadmap

- **Milestone 1 – Production Foundations (≈1.5 weeks)**
  - Deliverables: finalize ESLint 9 flat config + lint fixes, enforce env validation (ZeptoMail (transactional) and Zoho Campaigns (bulk)/Redis/DB), integrate Cloudflare Turnstile verify API, implement ZeptoMail (transactional) and Zoho Campaigns (bulk) OTP/email adapter (dev stubs + prod path), scaffold Playwright e2e harness, seed `.env.example` parity; two Brevo fallback accounts.
  - Recent progress: notification workers deliver reminders via ZeptoMail (transactional) and Zoho Campaigns (bulk); OTP/manual override rate limiting and override log persistence implemented; Playwright suite covers profile, admin, scan, and reminder flows in CI.
  - Risks: third-party credential availability; Turnstile rate limits during tests; refactoring existing auth code.
- **Milestone 2 – Notifications & Steward/Admin Experience (≈2 weeks)**
  - Deliverables: notification worker + ZeptoMail (transactional) and Zoho Campaigns (bulk) delivery, Web Push toggle, notification centre UI, steward offline sync hardening, approvals/guest flow completion, audit logging for overrides.
  - Recent progress: Notification REST API now exposes paginated feed, mark-read actions, and preference management; web app ships notification centre with unread badge, preferences modal, and nav entry wired to new backend contracts.
  - Risks: offline queue race conditions, ZeptoMail API throughput, complexity of admin UX acceptance.
  - Design notes:
    - Push channel: use Web Push (`web-push` library) with VAPID keys stored in env; persist browser subscriptions per user (Prisma `NotificationSubscription`) and queue deliveries via BullMQ; fall back to email/in-app when push disabled or subscription stale.
    - In-app channel: treat as real-time feed; mark notifications as `SENT` immediately and update unread counts via websockets (future) or polling; ensure preferences allow disabling.
    - Frontend: expose permission prompt and subscription lifecycle in `NotificationCenter`, store subscription in IndexedDB/local storage, sync to API, and surface push status/badges.
    - Offline queue hardening: deduplicate tokens client-side, cap queue at 500 entries, add reconciliation tests to ensure failed scans retry without blocking.
- **Milestone 3 – Reporting & Deployment (≈1.5 weeks)**
  - Deliverables: dashboards/CSV exports, bundle/perf budgets, Dockerfiles + docker-compose + Nginx/TLS config, backup/restore scripts, monitoring hooks (Sentry, uptime, queue metrics), CI caching & artefacts.
  - Risks: ensuring deterministic reports under RLS, container image size/performance, OCI vs other host choice.
- **Milestone 4 – Production Readiness & Release (≈1 week)**
  - Deliverables: Playwright e2e suite for core flows, accessibility/lighthouse automation, runbook polish, release notes + CHANGELOG, deployment dry run, final audit/ship checklist sign-off.
  - Risks: test flakiness under CI, coordinating stakeholder UAT, secrets management for dry run.

## 0) Goals & guardrails

- **Replace paper sheets** with a steward‑scanned QR system that works on **Android & iOS** (mobile web/PWA).
- **Zero self check‑in**. Only steward scans count.
- **Unique per‑event, per‑member** QR (rotating, single‑use) that can’t be shared or replayed.
- **Strict time window + geofence**. Accept scans only during event time and near the venue.
- **Check‑out** supported, with **optional multiple in/out sessions** per event.
- **Auto‑reminder + auto‑check‑out** when members forget to check‑out.
- **In‑app notifications** (+ push where supported) and **email fallback via ZeptoMail (transactional) and Zoho Campaigns (bulk)**; two Brevo fallback accounts.
- **VM‑hosted**; simple, low‑cost, maintainable; encrypted, backed up.

---

## 1) Operating model

### Roles

- **Super Admin**: Access to all settings without any restrictions
- **Multiple Council Admin**: manages all districts, clubs, global settings, audits, reports.
- **District Admin**: manages their respective district, clubs, global settings, audits, reports.
- **Club Admin**: creates events, sets venue/time rules, manages stewards, exports reports.
- **Steward**: scans member QRs (online or offline), can perform manual check‑in/out with reason.
- **Member**: logs in, opens event page, shows rotating event QR to steward; receives reminders.

#### RBAC matrix (terms aligned)

| Role                   | Scope           | Create Events | Configure Rules | Scan | Reports      | Export CSV  | Start/Extend/End | Manage Users | District Rollups |
| ---------------------- | --------------- | ------------- | --------------- | ---- | ------------ | ----------- | ---------------- | ------------ | ---------------- |
| Super Admin            | All             | ✓             | ✓               | —    | ✓            | ✓ (step‑up) | ✓ (step‑up)      | ✓            | ✓                |
| Multiple Council Admin | All districts   | ✓             | ✓               | —    | ✓            | ✓ (step‑up) | ✓ (step‑up)      | ✓            | ✓                |
| District Admin         | Own district    | ✓             | ✓               | —    | ✓            | ✓ (step‑up) | ✓ (step‑up)      | ✓            | ✓ (own)          |
| Club Admin             | Own club(s)     | ✓             | ✓               | —    | ✓            | ✓           | ✓                | ✓ (club)     | —                |
| Steward                | Assigned events | —             | —               | ✓    | —            | —           | ✓ (with reason)  | —            | —                |
| Member                 | Self            | —             | —               | —    | Self history | —           | —                | —            | —                |

> “Multiple Council Officers” is a **reporting category label**; RBAC uses **Multiple Council Admin**. We map officer titles to the nearest permissioned role for visibility in reports.

### Event modes

- **No‑RSVP (default)**
  - Anyone in the roster can attend.
  - **Pass minting:** Lazy‑mint on first open _or_ auto **pre‑provision** to roster at publish.
- **RSVP‑required**
  - Only RSVP’d attendees (plus optional walk‑ins) can scan.
  - **Pass minting:** Pre‑provision to RSVP list on register/approval.

### Defaults (configurable per event)

- Geofence: **300 m** radius around venue.
- Event window: **Start −30 min** to **End +30 min**.
- QR rotation: **30 s**; tokens are **single‑use**.
- **Reminders:** **10 min** and **5 min** before end.
- Auto‑check‑out grace: **+5 min after end**.
- Multiple sessions: **Off** by default (toggle On for trainings with breaks).
- **Accuracy policy:** reject scans when reported GPS **accuracy > 100 m** unless steward uses **manual override** (logged).
- **Quality alert:** raise an alert if **>5%** of scans for an event exceed 100 m accuracy.

---

## 2) End‑to‑end flows

### A) Member

1. First time: open web app → create passkey/OTP fallback → add to home screen (optional).
2. On event day: open app → “Today’s Events” → tap event → **My Event QR (rotating)**.
3. Steward scans → app shows **Checked in**. On exit, steward scans again → **Checked out**.
4. Near event end: receives **reminder**; if still active after grace, system **auto‑checks out** and notifies.

### B) Steward (scanner)

1. Open app → **SCAN**.
2. Points camera at member QR.
3. App verifies token (offline‑capable), checks time window + geofence (based on steward device), then decides:
   - No active session → **Check‑in**.
   - Active session → **Check‑out**.
   - (Optional) Manual override buttons: **Check‑in** / **Check‑out**.
4. If offline, store result locally and **sync later** (duplicates rejected).

### C) Admin/Organizer

1. Create event → choose mode (No‑RSVP / RSVP‑required) → set venue/time/geofence → toggles: multiple sessions, reminders, auto‑check‑out, walk‑ins.
2. (Optional) Pre‑provision passes to roster/RSVP list.
3. During event: monitor live counter (Present / Left / Active sessions).
4. After event: export CSV/Excel, email summary to organizers; generate district/national rollups.

---

## 3) Security model (defense‑in‑depth)

- **Strong login**: Passkeys (WebAuthn) default; email OTP fallback. Device‑bound sessions.
- **Event‑specific Member‑Event Pass (MEP)**: one per (member, event).
- **Rotating QR tokens**: compact signed payload with `event_id`, `user_id`, `jti`, `iat`, `nbf=now`, `exp≈30s`.
- **Single‑use & replay‑proof**: server/steward ledger burns `jti` on first acceptance; burn TTL = event window + drift.
- **Clock‑skew tolerance**: **±90 s** end‑to‑end. Show “Device clock out of sync” banner on the scanner if outside **±30 s**.
- **Time & place rules**: enforce event window + geofence using steward device GPS.
- **Steward‑only**: members cannot self‑check‑in.
- **Offline verification**: Ed25519 public key cached in scanner PWA; signature + `exp` checked locally.
- **Rate‑limits & bot defense**: per‑IP/user throttles; invisible challenge on auth and token endpoints.
- **Row‑Level Security**: Postgres RLS isolates clubs/districts in multi‑tenant schema.
- **Auditability**: every Start/Extend/End/Override requires a reason and is added to the audit log & reports.

## 4) Architecture

- **Start / Extend / End controls**: Expose configured limits (**Extend ≤60 min**, **10‑min cooldown**) inline. Require a short **reason**; show the last 3 changes with actor + timestamp. All changes feed the audit log and reports.

### Frontend (PWA)

- **Member app**: event list, rotating QR, status, notifications center, history.
- **Steward app**: full‑screen scanner, auto/explicit mode, offline banner & sync queue, counters.
- **Admin**: event creation, toggles, dashboards, exports, district/national rollups.
- **Offline**: Service Worker cache + IndexedDB queues for scans and notifications.

### Backend

- **API** (NestJS) with typed DTOs and strict schema validation.
- **Auth**: WebAuthn (passkeys), session cookies (SameSite=Lax, HttpOnly), OTP fallback.
- **Signer**: Ed25519 keypair service; key rotation via `kid` in token header.
- **Jobs**: Scheduler for reminders and auto‑check‑out; retry queues for email/notifications; cleanup of expired tokens.
- **Storage**: PostgreSQL (RLS) + Redis (queues, rate limiting, ephemeral token cache).
- **Email**: ZeptoMail SMTP/API for transactional emails.
- **Notifications**: In‑app banners for all; Web Push where supported; email fallback.

### Hosting (VM based)

- Ubuntu LTS + Docker; Nginx reverse proxy; auto‑TLS via Let’s Encrypt/Certbot; UFW firewall; fail2ban.
- Monitoring: uptime, error rate, latency, CPU/RAM/disk; log aggregation.
- Backups: nightly encrypted DB dumps (30‑day retention) + quick restore runbook.

---

## 5) Data model (key tables)

- **users**: `id`, `name`, `email`, `phone`, `club_id`, `status`.
- **webauthn_credentials**: `user_id`, `credential_id` (PK), `public_key`, `sign_count`, `device_label`, `created_at`.
- **clubs**: `id`, `district_id`, `name`.
- **districts**: `id`, `name`.
- **role_assignments**: `user_id`, `level` (`MULTIPLE_COUNCIL`|`DISTRICT`|`CLUB`), `role_title`, `start_ts`, `end_ts`, `active`.
- **events**: `id`, `club_id` (or district/global), `name`, `status`, `mode` (`NO_RSVP`|`RSVP`), `location` (geojson or lat/lng+radius), `scheduled_start`, `scheduled_end`, `geofence_radius_m`, `capacity`, `reminder_before_end_min`, `auto_checkout_grace_min`, `preprovision_strategy`.
- **member_event_passes**: `(event_id,user_id)` unique, `provisioned_at`, `status` (`provisioned`|`active`|`revoked`).
- **tokens**: `jti` (PK), `event_id`, `user_id`, `issued_at`, `nbf`, `exp`, `used_at`, `used_by_scanner_id`, `signature_kid`.
- **attendance_sessions**: `session_id` (PK), `event_id`, `user_id`, `check_in_ts`, `check_in_loc_ok`, `check_out_ts`, `check_out_loc_ok`, `method` (`steward`|`manual`), `scanner_device_id`.
- **rsvps** (RSVP mode): `(event_id,user_id)` unique, `status` (`invited`|`registered`|`approved`|`waitlisted`|`declined`), `created_at`, `updated_at`.
- **scanner_devices**: `id` (hash), `steward_user_id`, `ua_fingerprint`, `first_seen_at`, `last_seen_at`.
- **notification_subscriptions**: `user_id`, `endpoint`, `p256dh`, `auth`, `created_at`, `last_seen_at`.

**Constraints & behaviors**

- `events.capacity`: when set, `/scan` enforces capacity. In **RSVP** mode, over‑capacity → `waitlisted`; in **No‑RSVP**, over‑capacity denies check‑in with clear UI.
- Burn ledger for `tokens.jti` kept until **scheduled_end + auto_checkout_grace + 24h**.
- RLS ensures club/district scoping; joint events generate a single combined report with RLS exception for host admins.

## 7) Notification logic

- **Reminders (T_end − 10 min and T_end − 5 min):** in‑app banner + push (if permitted); email fallback if push not allowed.
- **Auto‑check‑out (T_end + 5 min):** close open sessions; send in‑app/push + email: “You were auto‑checked out at HH:MM.”
- Opt‑out controls per user for email/push (in‑app banners are always on for important events).

---

## 8) Steward offline mode

- Scanner PWA caches **public key (JWKS)**, **event rules**, and a **token burn ledger** in IndexedDB.
- Accepts/denies scans offline; queues results with timestamp + coarse location.
- **Freshness gate:** offline scanning only allowed if app has synced **time & keys within the last 24h**. Otherwise the Scan button is disabled with an action to re‑sync.
- On reconnect: **batch sync**; server re‑verifies signatures, applies geofence/time rules, rejects duplicates, and flags any failures for review.
- **Queue policy:** max **500** pending scans **and** max age **48h**; older entries are blocked from auto‑apply and require manual review.
- Extend/End actions offline: first writer wins; concurrent updates are stored as audit notes and surfaced in the event timeline.

## 9) Privacy & compliance (Sri Lanka PDPA)

- **Consent & transparency**: brief privacy notice; purpose = attendance & reporting.
- **Data minimization**: store name, email, club; GPS stored only if enabled; keep coarse lat/lng + accuracy.
- **Retention**: default 24 months for attendance (configurable); deletions on request.
- **Quick‑Add guests**: delete after **90 days** unless promoted to full member (notice shown at capture).
- **Access requests (DSAR)**: admin tool to export a member’s records; 30‑day SLA; actions are logged in audit log.
- **Cross‑border processing**: data stored in region (e.g., Mumbai/Singapore). Privacy notice includes cross‑border transfer statement.
- **Security**: TLS, passkeys preferred, RLS, audit logs, least‑privilege roles.

## 10) DevOps & deployment (VM)

- **Stack**: Ubuntu LTS, Docker Compose, Nginx, Let’s Encrypt/Certbot.
- **Secrets**: keep environment files in a secrets manager (Vault/SSM) or encrypted at rest on VM.
- **Backups**: nightly encrypted Postgres dumps to object storage; **quarterly key rotation**; restore runbook with named **RACI** and monthly drills recorded.
- **Monitoring/alerts**: Uptime, API error rate, queue depth, DB health, cert expiry; SLO **burn‑rate** alerts (e.g., 2% in 1h) auto‑open an incident.
- **Security headers (Nginx)**: CSP deny‑by‑default; allow camera page origins only; disable inline `eval`. Also `X‑Content‑Type‑Options: nosniff`, `Referrer‑Policy: same-origin`.
- **Rate limiting**: `limit_req` for `/scan`, `/auth/*`, `/tokens` with sane bursts.
- **Environments**: `staging` (test roster) and `prod` (real clubs).

## 11) QA & acceptance criteria

### Core

- Steward‑only scanning; member screens show QR but **cannot** submit without steward scan.
- Unique **(member,event)** pass; rotating tokens; single‑use enforced (duplicate `jti` rejected).
- Geofence + time window enforced using steward device; overrides require a **reason** and are flagged.
- Check‑in/out cycle works; optional **multiple sessions** per user captured accurately.
- Reminder sent **N minutes** before end; **auto‑check‑out** after grace; notifications recorded.

### Resilience

- Offline scanning works for ≤ **500** queued entries; after **48h** queued items require manual review.
- Clock skew **±90 s** end‑to‑end; show “clock out of sync” banner when scanner skew > **±30 s**.
- JWKS/time **freshness gate** blocks offline scan if last sync > **24h**.

### Reporting

- CSVs match **column contracts** with example rows above; include **Asia/Colombo** timezone stamp.
- Schedule vs Actual with **drift** columns; Start/Extend/End reasons appear in the audit sheet.
- Joint events generate a single combined report with correct **RLS** visibility.

### Security

- Tokens contain `nbf`, tight `exp≈30s`; burn ledger TTL = event window + drift + 24h.
- Admin exports and Start/Extend/End require **step‑up MFA** (passkey re‑auth within session).

### Edge cases

- Multi‑day events across midnight: window −30/+30 works across boundaries; correct total time.
- RSVP and walk‑ins conflict resolution requires explicit steward approval; audit log recorded.
- Mock‑location signals (low accuracy/provider) auto‑flag repeated offenders per **scanner device**.

## 12) Rollout plan (pilot → scale)

1. **Pilot (2–3 meetings)** with one district; collect feedback on scan speed, offline behavior, and steward UX.
2. **Training kit**: 2‑page steward guide, 1‑page member quick start, entrance signage template.
3. **Iterate**: adjust geofence defaults, reminder timing, and scanner UI.
4. **District‑wide** adoption; enable RSVP‑required for large events; publish national dashboards.

---

## 13) Backlog (first 12 tickets)

1. Bootstrap project (PWA shell, auth scaffolding).
2. WebAuthn + OTP fallback (with Turnstile on auth endpoints).
3. Event CRUD + settings (modes, geofence/time window, toggles).
4. Roster import (CSV) + roles.
5. MEP minting (lazy + pre‑provision) and rotating token service (Ed25519 sign).
6. Steward scanner (ZXing), offline queue, local signature verify, geofence check.
7. Scan API + idempotency (`jti` burn).
8. Multiple sessions toggle + check‑out logic.
9. Reminders + auto‑check‑out jobs; in‑app banners, push, email via ZeptoMail (transactional) and Zoho Campaigns (bulk); two Brevo fallback accounts.
10. Reports: event CSV + sessions CSV.
11. District/national rollups + dashboards.
12. DevOps: Nginx, TLS, backups, monitoring; staging/prod.

---

## 14) Risks & mitigations

- **Location spoofing** → enforce steward‑device geofence; short token lifetimes; manual override flagged.
- **Poor connectivity** → steward offline mode, pre‑provision passes, member prefetch.
- **Email deliverability** → SPF/DKIM with ZeptoMail (transactional) and Zoho Campaigns (bulk); domain warm‑up; templates with minimal imagery; two Brevo fallback accounts; two Brevo fallback accounts.
- **Device compatibility** → fall back to in‑app banners + email where push isn’t supported.
- **Data errors** → manual actions require notes; audit logs + exports for reconciliation.

---

## 15) Success metrics (90‑day)

- ≥ **95%** members checked in/out via steward scans (≤ 5% manual).
- **Scan latency**: median < 1.2s online; < 0.4s offline verify.
- **Auto‑check‑out** handles < 15% of attendees (reminder effectiveness).
- **Zero** cross‑club data leaks (RLS audits).
- **<0.1%** duplicate/replay attempts accepted (target 0%).

---

## 16) Budget (starter, per month; VM pricing varies by region)

- VM (2–4 vCPU, 4–8 GB RAM): USD **$10–20**.
- Object storage for backups: USD **$2–5**.
- Domain + DNS: USD **$1–2**.
- Email (ZeptoMail SMTP): often free tier + usage; plan for USD **$5–15** depending on volume.
- Misc (monitoring, error tracking): **$0–10**.

---

## 17) Checklists

### Venue checklist

- [ ] At least **2 stewards** with charger/power bank.
- [ ] Printed **“Show your QR to the steward”** sign.
- [ ] Test scan at venue entrance (GPS + geofence).
- [ ] Offline test (flight mode) → ensure queueing works.

### Steward quick guide

- [ ] Open scanner → test on sample QR.
- [ ] If manual check‑in/out, **add reason**.
- [ ] Watch offline banner; don’t clear app cache until synced.

### Admin pre‑event

- [ ] Choose mode (No‑RSVP/RSVP), set geofence/time window.
- [ ] (Optional) Pre‑provision passes (roster/RSVP).
- [ ] Enable reminders + auto‑check‑out.
- [ ] Verify email templates (ZeptoMail (transactional) and Zoho Campaigns (bulk)); two Brevo fallback accounts.

---

## 18) Open decisions (choose defaults; can change later)

- Event defaults: geofence 300 m; window −30/+30; reminders 10 & 5 min; auto‑check‑out +5; multiple sessions Off.
- Walk‑ins for RSVP events: **On** or Off?
- Push notifications: enable by default? (use in‑app banners regardless).
- Host on AWS Lightsail, DigitalOcean, or Hetzner?

---

## 19) What we need from you

- Club/district branding (logos, colors).
- Roster CSV (name, email, club, role).
- Decision on host (VM provider) and default toggles above.

---

_Ready to implement. Next step: approve defaults and pick the VM provider; we’ll start with the twelve‑ticket backlog above._

---

## 20) Registration & Onboarding (added)

### Overview

Support three entry paths, with **Invite-based** as the default. All paths end by creating a **passkey** (Face/Touch ID) with **email OTP fallback**.

### A) Invite-based (recommended default)

1. **Roster upload (CSV)** by Club/District admin: name, email, club, role.
2. System sends **magic-link invite** (ZeptoMail (transactional) and Zoho Campaigns (bulk)).
3. Member opens link → **consent (PDPA)** → confirm profile fields from roster.
4. Create **passkey** (WebAuthn).
5. Set **backup sign-in** (email OTP).
6. Land on **Today** screen; no per-event RSVP unless organizer enables it.

**Admin controls:** resend invites, revoke/cancel, view pending.  
**Anti‑abuse:** invisible human check (Turnstile), IP/email rate limits.

### B) Self‑serve via **Club Join Code / Poster QR**

1. Admin generates **Join Code** (e.g., LEO‑KOTAHENA‑2025) + printable poster.
2. Prospect scans poster or enters code → **verify email** (double‑opt‑in).
3. **Approval policy** (choose one per club): Manual | Auto by email domain | Auto by roster badge/ID.
4. On approval → passkey + OTP setup → member joins roster.

### C) **Walk‑in / Guest** (at the door)

1. Steward taps **Add walk‑in** → enter name + email (club optional).
2. Guest is **checked in**; system emails **Finish Signup** link.
3. On completion, guest record **merges** to full profile; past attendance preserved.

### Stewards/Admins onboarding

- Same invite flow with elevated role; can also be promoted/demoted later in Admin console.

### Recovery & devices

- New device: sign in with OTP → **register new passkey** → old key auto‑revoked or manually revoke in **My Devices**.
- Lost email access: Admin issues one‑time recovery link after offline verification.

### Consent & privacy

- First run shows purpose, retention (default **24 months**), contact for data requests.
- Only collect **name, email, club** (phone optional).
- Users can **download** their data or **request deletion** from Profile.

---

## 21) PWA UX – What members see after login (added)

### Home (Today)

- **Active Event Card** (if within window): big **“Show My Event QR”** button, status chip (**Checked in / Checked out**), timer to event end, and reminder info.
- **Upcoming** list (next 7 days): RSVP buttons if event requires it.
- **Notifications** bell: in‑app messages (reminders, auto‑check‑out confirmations, announcements).
- **Offline badge** if network is poor; shows pending actions to sync.

### My Event QR

- Full‑screen rotating QR (refresh ~30s) tied to this **(member,event)** pass.
- Shows **current status** (Checked in / out) and last scan time.
- Safety notes: “Steward must scan; screenshots won’t work.”

### History

- List of past events with **first‑in, last‑out, total time**.
- Tap into an event for session details (if multiple sessions enabled).

### Announcements (optional)

- Club/District announcements (text + links). Admin can pin items for N days.

---

## 22) Profile & Settings (added)

### Profile

- **View/Edit**: display name, preferred language (**Sinhala/Tamil/English**), optional phone.
- **Email**: change requires new verification; old email stays active until confirmed.
- **Club**: read‑only; change requires admin request (button: _Request club change_).

#### Security & Abuse‑Resistance Additions (2025-10-22)

- **Offline JWKS rotation policy.** Cache public keys with `kid`. Refresh JWKS **on app open** and **every 6 hours**. If offline, validate with **last known good** until expiry; on failure, show “Unable to verify — reconnect to sync keys.”
- **Clock‑skew handling.** Rotating tokens (`exp≈30s`) tolerate **±90 s** device skew. Show a “Device clock out of sync” banner and re‑check against **server time** after sync.
- **Location spoofing hardening.** Record `accuracy` and **provider** (GPS/Wi‑Fi). Flag scans with accuracy worse than **100 m** or detected mock‑location providers for review.
- **Admin MFA & rate limits.** Require **passkeys** for Admin/Steward. Enforce per‑IP and per‑user throttles on `/scan` and `/events/*/notify/*` with clear **HTTP 429** responses.

### Security

- **Passkeys (My Devices)**: list of registered devices; add/remove.
- **Backup sign-in**: re‑send OTP test; enable/disable email fallback.

### Notifications

- **In‑app** (always on for important items).
- **Push**: enable/disable; test notification.
- **Email**: toggle reminders/announcements.

#### Privacy & Compliance Updates (2025-10-22)

- **PDPA data‑subject requests.** SLA: **30 days**. Provide contact email and log consent version with a changelog link.
- **Guest data minimization.** For **Quick Add**, do **not** store email unless necessary; set default retention **90 days** and display this in the capture UI.

### Privacy

- **Download my data** (attendance CSV + profile).
- **Request deletion** (routes to admin approval queue with identity check).
- **Consent log**: shows date/version of privacy notice accepted.

### Preferences & Accessibility

- **Language** switcher (instant).
- **Text size** (Large/XL).
- **High contrast** mode.
- **Battery saver** (reduces camera frame rate during QR screen).

---

## 23) Member first‑run & empty states (added)

- If no events today: friendly empty state + upcoming events and a link to **All Events**.
- If event requires RSVP and user hasn’t: “RSVP to unlock your event QR.”
- If geolocation off: prompt with explanation; allow steward override (logged).

---

## 24) Admin/Steward UI additions (added)

- **Admin**: Invite center (pending/sent), Join Code management, approval queue, resend/cancel invites, role assignment.
- **Steward**: Quick actions — Add walk‑in, Manual check‑in/out (reason required), Sync now; scanner settings (Auto/Check‑in/Check‑out).

---

## 25) Backlog additions (registration & UX)

13. Invite center + CSV roster import UI with validation + dedupe.
14. Club Join Code flows (poster generator, approval policy, double‑opt‑in).
15. Walk‑in capture + post‑event merge.
16. Profile: edit name/language/phone; email change with re‑verification; **My Devices**.
17. Notifications center + push enable flow + email preferences.
18. Privacy: data export, deletion request, consent log.
19. Empty states, offline badges, and test modes (push, OTP).
20. Admin approvals queue + role management.

---

## 26) Invited Guests & Non‑Members (documentation and flow) — updated

### Goals

Record attendance for anyone who is **not in the Leo roster** (parents, sponsors, speakers, prospects, community partners) without weakening security or slowing the line.

### Invited Guest types

Configurable taxonomy (examples): **Guest**, **VIP**, **Speaker**, **Parent**, **Sponsor**, **Prospective Member**. Admins can add/edit types and colors.

### Capture modes (choose per event or mix)

1. **Quick Add (no email)** — fastest
   - Steward taps **Add Invited Guest** → enters **Name** (required) + **Type** (dropdown) + optional **Note**.
   - Tap **Check‑in**. System creates an **InvitedGuest‑Event record** (no account), time‑stamps check‑in, geofence/window enforced via **steward device**.
   - For **Check‑out**, steward finds the guest in the current list and taps **Check‑out** (or scans a temporary QR if you enable badges, see below).
   - Notifications: none (no contact info). **Auto‑check‑out** still runs after grace.

2. **Email Link QR (soft signup)** — balanced
   - Capture **Name + Email** at the door (or pre‑collect via form).
   - System emails an **Invited Guest Pass** link that opens a simple web page (no app install) showing a **rotating event QR**.
   - Steward scans the guest’s QR for check‑in/out (same security: single‑use, geofenced, time‑boxed).
   - After event, guest receives a **Thank you / Finish Signup** link to become a full member if appropriate.

3. **Pre‑registered Guest List (RSVP guest)** — smooth for VIPs
   - Organizer uploads or enters **invited guest list** ahead of time (Name, Email, Type).
   - System **pre‑provisions Guest‑Event Passes** and sends calendar/invite email with the **Guest Pass** link.
   - On arrival, steward searches name or guest shows the emailed **rotating QR**.

> You can enable any combination: e.g., VIPs pre‑registered, general public via Quick Add, and prospects via Email Link QR.

### Optional: Badge/Sticker QR (for venues with a small label printer)

- On check‑in, the steward can **print a small sticker** with guest name and a **temporary QR** that toggles their session when scanned by stewards. This is optional and keeps lines moving for guests without phones. Stickers expire at event end.

### Security rules (invited guests)

- **No self check‑in** (consistent with the system). All guest scans/actions are **steward‑initiated**.
- **Geofence + time window** always enforced via **steward device**.
- **Single‑use rotating tokens** for Email Link QR / badge QR; **manual tap** for Quick Add.
- **Rate limits** on Add Guest to prevent abuse; all guest additions are **audit‑logged** with steward ID.

### Data model additions

- **invited_guest_event_attendees** (UI label: Invited Guests): `id`, `event_id`, `name`, `email (nullable)`, `type`, `created_by_steward_id`, `check_in_time`, `check_in_loc_ok`, `check_out_time`, `check_out_loc_ok`, `method` (manual|qr), `notes`.
- **invited_guest_pass_tokens** (if using QR): `jti`, `event_id`, `guest_attendee_id`, `issued_at`, `exp`, `used_at`, `used_by_scanner_id`, `signature_kid`.
- **dedupe**: if an invited guest later signs up (same email), past invited‑guest records **merge** under the new user profile with a "source=invited_guest" tag.

### Reporting

- Event reports include an **Invited Guests** section with counts by **type** and a full list (name, type, in/out times, total time, notes).
- District/national rollups show **member attendance** and **guest attendance** separately (with breakdowns by type).
- CSV exports include an `is_invited_guest` flag and `invited_guest_type`.

### Privacy & retention (PDPA)

- **Quick Add (no email)**: collect minimal data (name + optional note). Default retention **90 days** unless event policy requires longer; visible to admins in that club/district only.
- **Email Link QR / Pre‑registered**: show a short consent line in the email/link; retention follows standard attendance (**24 months** default) unless reconfigured.
- Guests can contact the organizer to request removal; admins can delete guest records (keeps aggregate counts).

### Acceptance criteria (guests)

- Steward can **Add Guest** in ≤ 10 seconds (name + type).
- Geofence + time window enforced on guest check‑in/out; overrides require a reason and are flagged.
- Email Link QR opens a **single‑event** rotating QR without requiring app install; scans succeed offline with later sync.
- Reports clearly separate members vs guests and include totals by type.
- If a guest later registers with the same email, their **guest history merges** under the member profile automatically.

---

## 27) Reporting Order (customized) — updated

Reports will present attendance in the **exact order** you specified:

1.  **Invited Guests**
2.  **Lions**
3.  **Multiple Council Officers**
4.  **District Council Officers**
5.  **Club Executive Officers**
6.  **Club Members**
7.  **Visiting Leos**
8.  **Outsiders**

### Classification rules (deterministic)

Each attendee gets one `report_category` derived by the following precedence:

1. If marked **Invited Guest** (incl. VIP/Speaker/Sponsor/Parent/Prospect types) → **Invited Guests**.
2. Else if flagged **Lion** → **Lions**.
3. Else if **Multiple Council (MD) Officer** (offices at the Multiple Council/Multiple District level that oversee and direct one or more District Councils) → **Multiple Council Officers**.
4. Else if **District Council Officer** (single role) → **District Council Officers**.
5. Else if **Club Executive Officer** (President/Secretary/Treasurer/VP/etc.) → **Club Executive Officers**.
6. Else if member of **host club(s)** → **Club Members**.
7. Else if **Leo from another club/district** → **Visiting Leos**.
8. Else → **Outsiders** (non‑Leo, non‑Lion, not categorized above).

> Admins can override an attendee’s category from the event report if needed; changes are audit‑logged.

#### Terminology note

- **Multiple Council (MD)**: the national/Multiple District leadership layer that **oversees District Councils**.
- **District Council**: the district‑level leadership layer (below Multiple Council, above clubs).

### Implementation

- Add fields: `report_category` (enum) and `report_rank` (int 1–8) at compute time for deterministic sorting in UIs/exports.
- CSV/Excel exports include both fields; dashboards group by `report_category` in the above order.
- For **joint events**, a **single combined report** is generated for all host clubs (no per‑host division of attendance).
- For joint events, **Club Members** refers to host clubs only; Leos from non‑host clubs fall under **Visiting Leos**.

## 28) Joint Events — updated

- **Co-hosted events** can list multiple host clubs (and, optionally, multiple districts if applicable).
- **Stewards** may belong to any host club and scan for the joint event.
- **Single combined report**: the system produces **one consolidated report** for the entire joint event. There is **no division** or split of attendance by host club.
- **Categories** in the report follow your specified order (Invited Guests, Lions, Multiple Council Officers, District Council Officers, Club Executive Officers, Club Members, Visiting Leos, Outsiders).
- **Exports**: a single CSV/Excel for the joint event; includes `host_clubs` column for context only (not used for splitting counts).

---

**RLS enforcement (DB policy):**

- Postgres policy `events_cohost_read`: permit `SELECT` on `events` where the current actor has role `admin` or `steward` **in any `host_club`** for that `event_id`.
- Propagate by `event_id` to `attendance_sessions`, `member_event_passes`, and `invited_guest_event_attendees` via matching `event_id`.
- Non‑host clubs do **not** gain visibility; their members appear only as **Visiting Leos** in the combined report.

## 29) Schedule Drift (late start / early or late end) — added

**Goal:** Handle real-world timing changes without breaking security or reports.

### What happens by default (no button presses)

- **Early arrivals / late start:** Check-ins are accepted from **Start −30 min** onward. If the meeting starts late, scanning still works; reports show scheduled times and also compute **Actual Start** (time of first successful scan).
- **Running past time:** Scanning is allowed until **End +30 min** by default. If you go beyond that, the steward app prompts to **Extend**.
- **Ending early:** If you stop scanning and no one is checked in, the system will still send the scheduled reminders and auto-check‑out at **T_end +5** unless you press **End Now**.

### Quick actions (steward/admin)

- **Start Now:** shifts the event’s **effective start** to current time for validation (audit‑logged).
- **Extend End:** +15 / +30 / +60 min buttons (or custom). Updates the allowed window and reschedules the **10 & 5 min** reminders accordingly.
- **End Now:** closes the event early. Sends a final banner/push (“Event ended”), then performs **auto‑check‑out in 5 min** for anyone still active.
- **Soft vs Hard changes:**
  - **Soft** (default): adjusts validation window and reminders **without** changing the scheduled times shown on public/event cards.
  - **Hard**: also updates the event’s scheduled end time (requires admin role; logged).

### Reporting semantics

- **Scheduled Start/End** (what was planned) vs **Actual Start/End** (first‑in to last‑out).
- **Overrun/Underrun** minutes = Actual duration − Scheduled duration.
- All adjustments (Start Now/Extend/End Now) are **audit‑logged** with who/when/why.

### Offline venues

- Stewards can **Extend End** and **End Now** while offline; the actions sync later with timestamps. Validation continues locally based on the action time.

---

## 30) Dashboards & Metrics — added

### Event dashboard (per event)

- **Live attendance line** (check‑ins/min).
- **Totals by category (ordered):** Invited Guests, Lions, Multiple Council Officers, District Council Officers, Club Executive Officers, Club Members, Visiting Leos, Outsiders.
- **Throughput & ops:** median scan time, offline scans queued, geofence/time failures, manual overrides, auto‑checkouts, reminders sent.
- **Timing:** Scheduled vs Actual Start/End; Overrun/Underrun minutes; dwell time distribution (per‑person total time).
- **RSVP funnel** (when enabled): invited → RSVP’d → attended; no‑shows.

### Club dashboard

- Attendance trends over time; top events; participation by member; invited guest mix; manual overrides ratio.

### District / Multiple Council dashboard

- Rollups by club; category breakdown; officer attendance; joint‑event counts; trend lines by month/quarter.

### Tech for charts in the PWA

- **Recharts** for React (simple, responsive).
- Use the same Tailwind theme tokens; integrate with **shadcn/ui** & **HeroUI** cards/tabs.

### Exports & alerts

- One‑click CSV/Excel per event; monthly district rollup export.
- Optional alerts: sudden drop in scans (possible network issue), high geofence failures, high manual overrides.

---

## 31) Frontend UI kit & i18n (update) — added

- **UI kit:** Tailwind CSS + Headless UI + **shadcn/ui** (as the design‑system baseline) + **HeroUI** (supplemental components like tables, tabs, modal dialogs). Keep colors/tokens unified under Tailwind; wrap third‑party components so styling stays consistent.
- **i18n:** i18next with **English as the current default**. Sinhala/Tamil resource files scaffolded but disabled in the UI until ready. Profile shows “Language” as English only for now; when enabled, the switcher exposes Sinhala/Tamil.

---

## 32) Tech stack & services (finalized)

### Frontend (PWA)

- **Framework:** React + TypeScript + Vite.
- **UI kit:** Tailwind CSS + Headless UI + **shadcn/ui** (design-system baseline) + **HeroUI** (tables, tabs, modals). Unified Tailwind tokens.
- **Routing/state:** React Router; React Query (+ Zustand for lightweight app state).
- **QR scanning:** **ZXing** (browser camera).
- **PWA/offline:** Workbox service worker; IndexedDB for steward offline queue.
- **Charts:** **Recharts** (inside shadcn/HeroUI cards).
- **i18n:** i18next (**English only** at launch; Sinhala/Tamil scaffolded).
- **Push notifications:** Web Push (VAPID) + in-app banners.

### Backend (API, crypto, jobs)

- **Runtime/Framework:** Node.js 20 LTS + **NestJS** (DI, modules).
- **Auth:** **simplewebauthn** (WebAuthn/passkeys) + email OTP fallback.
- **Crypto:** **Ed25519** signatures with **libsodium** (or tweetnacl) for QR token signing/verify; `kid` for key rotation.
- **Validation:** class-validator (DTOs) or Zod.
- **Database:** **PostgreSQL** with **Row‑Level Security** (multi‑tenant isolation for clubs/districts).
- **ORM:** **Prisma**.
- **Queues/Rate limits:** **Redis** + **BullMQ** (reminders, auto‑check‑out, emails).
- **Bot defense:** **Cloudflare Turnstile** on auth/token endpoints.
- **Email:** **ZeptoMail (transactional) and Zoho Campaigns (bulk)** SMTP/API (invites, verification, recaps, fallback for reminders); two Brevo fallback accounts.

#### SRE / DevOps Updates (2025-10-22)

- **Performance budgets.** PWA JS budget **≤ 300 KB gz**; Time‑to‑Interactive **≤ 3.5 s** on mid‑tier Android; scan API latency targets: **p50 < 300 ms**, **p95 < 800 ms**.
- **SLOs & error budgets.** API availability **99.9%** monthly; queue time SLOs aligned with scan targets; alerts fire on **SLO burn** not raw thresholds.
- **Secrets & rotation.** Use Vault/SSM with **quarterly rotation** plus **break‑glass runbook**.
- **Security headers & Nginx.** Enforce **HSTS**, **CSP** (camera page whitelists), and `limit_req` on `/auth`, `/scan`, `/tokens`.
- **Backups & DR.** Monthly restore tests plus **quarterly DR drills** with explicit **RTO/RPO** targets.

### DevOps & hosting (single VM, dockerized)

- **Host options (near Sri Lanka):** AWS **Lightsail** (Mumbai/Singapore) or **DigitalOcean** (Singapore/Bangalore). Alt: Hetzner if latency acceptable.
- **Spec (pilot):** 2–4 vCPU, 4–8 GB RAM, 60–80 GB SSD.
- **Stack:** Ubuntu LTS; **Docker Compose** (services: `nginx`, `api`, `web`, `postgres`, `redis`, optional `sentry-relay`/`uptime-kuma`).
- **TLS:** **Let’s Encrypt + Certbot** (auto‑renew). Nginx HTTP/2 + gzip/brotli.
- **Security:** UFW firewall; fail2ban; least‑privilege Linux users; automatic OS updates.
- **Backups:** nightly `pg_dump` encrypted to S3‑compatible storage (DO Spaces/B2/S3), 30‑day retention; monthly restore drill.
- **Monitoring & logging:** Sentry (FE/BE errors), Uptime Kuma (pings), basic Node Exporter or Netdata; centralize Nginx/app logs (optionally Loki).
- **Secrets:** `.env` encrypted at rest; optional Doppler/1Password CLI for managed secrets.

### Packages you’ll actually use

- `@simplewebauthn/server`, `@simplewebauthn/browser`
- `libsodium-wrappers` (or `tweetnacl`)
- `zod` or `class-validator` + `class-transformer`
- `bullmq`, `ioredis`
- `zxing/browser`
- `workbox-window`
- `web-push`
- `@prisma/client`, `prisma`
- `@nestjs/*`

### Why this stack

- **Secure by default:** passkeys, signed 30‑s tokens (EdDSA), Turnstile, RLS.
- **Offline‑capable:** PWA w/ Workbox + IndexedDB; steward verifies locally.
- **Low‑ops on a VM:** all dockerized; simple backups/monitoring; predictable cost.
- **Fast iteration:** NestJS + Prisma + React/Vite + shadcn/ui keeps velocity high and UI consistent.

### Optional upgrades (when you scale)

- **Managed Postgres** (RDS/Neon) for PITR and automated patching.
- **Key management** (HashiCorp Vault/AWS KMS) for signing keys.
- **CDN** (Cloudflare) for static assets; DNS & WAF.
- **Object storage** lifecycle policies for backups (auto‑prune).

#### Product & UX Updates (2025-10-22)

- **Geofence & time-window defaults – rationale & edges.** Default radius: **300 m**; default windows: **−30/+30 min** around scheduled start/end. For small / indoor venues, allow presets: **50 m**, **100 m**, **150 m**. Document indoor GPS drift behavior and multi-day events.
- **Schedule-drift abuse guards.** Add per-event limits: max extend ≤ **60 min** without admin; cooldown **10 min** between extensions; require a short **reason code**; reminder logic auto-shifts when extended.
- **Guest flows – duplicate safety.** For **Quick Add**, warn on same-name entries within last **30 days** and require a short note to aid later merges. Continue merging invited-guest history on email match.
- **Device support & permissions.** Support matrix (min): **iOS 16+/Safari**, **Android 10+/Chrome**. First-run camera & location prompts with retry affordances; graceful fallback if permission denied.
- **Accessibility.** Provide ARIA labels on scanner screen, logical focus order, and high-contrast QR borders in the UI kit.

#### API Design Updates (2025-10-22)

- **Idempotency & error envelope.** Manual overrides accept `Idempotency-Key`. Standard error envelope: `{ "error": {"code":"GEOFENCE_FAIL|WINDOW_CLOSED|REPLAY|RATE_LIMIT"}, "message": "...", "request_id": "..." }`.
- **Rate‑limit headers.** Include `Retry-After` and `X-RateLimit-Remaining` on **429** for `/auth/token`, `/scan`, and notification endpoints.
- **Web Push lifecycle.** Add endpoint to delete stale subscriptions and handle **HTTP 410** responses to prune invalid VAPID keys.

- **Disaster recovery targets (pilot):** **RTO ≤ 4h**, **RPO ≤ 24h**. Validate quarterly with a documented DR drill and store results.
