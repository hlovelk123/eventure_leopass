# Security Overview (Bootstrap)

> This document is maintained throughout the project. Populate detailed controls as phases progress.

- **Auth flows**: WebAuthn (passkeys) with email OTP fallback will be implemented in Phase 1.
- **Bot protection**: Cloudflare Turnstile verification executed on auth/token endpoints.
- **Data storage**: PostgreSQL with Prisma + Row Level Security for tenant isolation.
- **Secrets**: Manage via environment variables; never commit live credentials.
- **Crypto**: Ed25519 single-use QR tokens with rotation (Phase 2).

Additional sections (threat model, data classification, hardening checklist) will be appended in later phases.
