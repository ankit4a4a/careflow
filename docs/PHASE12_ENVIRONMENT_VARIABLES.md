# Phase 12 environment variable guide

Use `server/.env.example` as the current template. It contains placeholders only; copy it to `server/.env` locally and never commit the real file.

| Variable | Purpose | Production guidance |
|---|---|---|
| `NODE_ENV` | Runtime mode | `production` |
| `PORT` | Express listen port | Set to platform-assigned port where required. |
| `CLIENT_ORIGIN` | Comma-separated CORS origins | Exact HTTPS origins only; no wildcard. |
| `MONGODB_URI` | MongoDB connection | Dedicated least-privilege user, TLS, replica set. |
| `JWT_ACCESS_SECRET` | Access JWT signing secret | Required at startup; at least 32 chars, use high entropy. |
| `JWT_REFRESH_SECRET` | Placeholder in example | Not referenced by current source; refresh tokens are random opaque values hashed in DB. Do not assume it is active. |
| `ACCESS_TOKEN_TTL` | Access JWT lifetime | Keep short (default `15m`) and test UX/session policy. |
| `REFRESH_TOKEN_DAYS` | Refresh session lifetime | Choose based on risk and organizational policy. |
| `COOKIE_SECURE` | Secure refresh cookie | Must be `true` in HTTPS production. HttpOnly and SameSite Strict are set in code. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email transport | Use a provider credential stored in secret manager. |
| `CLIENT_URL`, `CLIENT_PUBLIC_URL` | Browser URLs used in email/invitation links | Exact canonical HTTPS frontend URL. |
| `REQUIRE_EMAIL_VERIFICATION` | Enforce verified email at login | Set `true` if verification delivery is configured and tested. |
| `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Initial admin script inputs | Supply only during controlled bootstrap; remove from runtime environment afterward. |
| `PHARMACY_LEGACY_TENANT_ID`, `PHARMACY_LEGACY_BRANCH_ID` | Explicit target for legacy stock migration | Leave unset unless running the reviewed one-time migration. |
| `ENABLE_INLINE_WORKERS` | Run notification worker inside API process | Prefer `false`; run `npm run worker` separately. |
| `HRM_PRIVATE_STORAGE_DIR` | HRM private upload directory | Outside public root; restrict OS permissions; back up. |
| `REPORT_PRIVATE_STORAGE_DIR` | Private report export directory | Outside public root; restrict OS permissions; apply retention cleanup. |

The source currently checks the length of `JWT_ACCESS_SECRET` on API startup. It does not currently validate all environment variables at boot. Add deployment-side validation and secret-manager controls before production.
