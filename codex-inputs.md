# Codex Inputs — QR Attendance App

> Save this as `codex-inputs.md` in the repo root. Codex: read this file for configuration, secrets, and decisions before starting work.

---

## 0) Confirm fixed items (already provided)

- **Hosting provider:** Oracle Cloud VM **Standard.A1.Flex** — **4 OCPUs**, **24 GB RAM**, **200 GB** block storage ✅
- **Domain & TLS:** **leo.eventurelk.com** via **Cloudflare** (proxy + TLS) ✅

---

## 1) Contacts & ownership

- **Primary incident contact:** **Leo Lasiru Lakruwan** · **lasiru.lakruwan@gmail.com** · **+94 71 910 8276**
- **Security/Privacy contact (consent & DSAR UI):** **privacy@eventurelk.com**

---

## 2) Email delivery — Transactional (Primary: ZeptoMail Sandbox; Fallback: Brevo 1)

Choose **one** ZeptoMail method for Sandbox now (SMTP _or_ API).

### 2.1 ZeptoMail (Sandbox) — SMTP **or** API

```env
# --- ZeptoMail (Sandbox) via SMTP ---
ZEPTO_SMTP_HOST=smtp.zeptomail.com
ZEPTO_SMTP_PORT=587
ZEPTO_SMTP_USER=__REPLACE__
ZEPTO_SMTP_PASS=__REPLACE__

# --- OR ZeptoMail (Sandbox) via API ---
ZEPTO_API_KEY=__REPLACE__
ZEPTO_MAILAGENT_ALIAS=__REPLACE__   # Mail Agent alias
```

### 2.2 Brevo **1** (Transactional fallback)

```env
BREVO1_API_KEY=__REPLACE__
# (optional SMTP if we toggle relay)
BREVO1_SMTP_HOST=smtp-relay.brevo.com
BREVO1_SMTP_PORT=587
BREVO1_SMTP_USER=__REPLACE__
BREVO1_SMTP_PASS=__REPLACE__
```

---

## 3) Bulk email — Zoho Campaigns (Primary) + Brevo **2** (Fallback)

## 4) Cloudflare Turnstile

```env
CF_TURNSTILE_SITE_KEY=__REPLACE__
CF_TURNSTILE_SECRET_KEY=__REPLACE__
```

---

## 5) Backups — **Oracle Cloud Object Storage (S3-compatible)** (Always Free to start)

```env
OCI_NAMESPACE=__REPLACE__
OCI_REGION=ap-mumbai-1            # example; set your region
OCI_S3_ENDPOINT=https://${OCI_NAMESPACE}.compat.objectstorage.${OCI_REGION}.oraclecloud.com
OCI_S3_ACCESS_KEY=__REPLACE__     # Access Key (from OCI Console user)
OCI_S3_SECRET_KEY=__REPLACE__     # Customer Secret Key
OCI_BUCKET=leo-prod-backups
BACKUP_CRON=0 2 * * *             # 02:00 local daily
```

---

## 6) GitHub & CI

```env
GIT_REMOTE_ORIGIN=git@github.com:ORG/REPO.git
CI_NODE_VERSION=20
CI_RUN_E2E=true
```

---

## 7) Branding

- **Logo primary (SVG):** `assets/brand/leo-primary.svg`
- **Logo monochrome (SVG):** `assets/brand/leo-mono.svg`
- **Palette (hex):**
  - Primary: `#1463FF`
  - Secondary: `#F59E0B`
  - Accent: `#10B981`
  - Neutral-900/700/500/300/100: `#0B1220 / #1F2937 / #6B7280 / #D1D5DB / #F3F4F6` _(edit if you have official tokens)_
- **Typography:** Inter (Latin), Noto Sans Sinhala, Noto Sans Tamil

---

## 8) Roster CSV

**Columns (v1):**

```
external_id,full_name,email,phone,organization,role,tags,sessions,rsvp_status,consent_ts,locale
```

**Sample rows:**

```
EMP-1001,Anuja Perera,anuja@example.com,+94771234567,Leo Sri Lanka,Attendee,VIP|Board,S1|S2,accepted,2025-10-20T09:10:00+05:30,si-LK
EMP-1002,K. Aravind,aravind@example.com,+94761234567,Leo Sri Lanka,Speaker,AI,S2,accepted,2025-10-20T09:12:00+05:30,ta-LK
```

**Retention:** 365 days post-event unless erased by DSAR.

---

## 9) Defaults & feature toggles

- [x] RSVP walk-ins **ON**
- [x] Push notifications **opt-in** only (prompt after user gesture)
- [x] Geofence presets: **100 m** (default), 250 m, 500 m
- [x] Reminders: **T-24h**, **T-1h**, **T-10m**
- [x] Auto check-out when outside geofence for **10 min**
- [ ] Multiple sessions per user **OFF** by default (enable per event)

---

## 10) Monitoring & alerting

```env
SENTRY_DSN=__REPLACE__             # one per environment
UPTIME_KUMA_URL=http://SERVER:3001 # if using self-hosted Kuma
UPTIME_KUMA_API_KEY=__REPLACE__    # optional
PROMETHEUS_SCRAPE_NODE=true        # enable Node Exporter
```

---

## 11) Localization & accessibility

- Languages: **si-LK**, **ta-LK**, **en-LK**
- A11y target: **WCAG 2.2 AA**

---

## 12) PWA assets

- `public/icons/icon-192.png`
- `public/icons/icon-512.png`
- `public/apple-touch-icon.png` (≥180×180)
- (optional) Maskable icons

---

## 13) Approval mode for Codex

- [x] **Auto-approve** safe code edits & file ops
- [ ] Ask before shell commands that touch network or credentials
- [ ] Ask before schema migrations in **prod**
