# Phase 11 setup

## Requirements

- Existing Phase 10 project and supported Node.js version from `server/package.json`.
- MongoDB connection configured as for earlier phases.
- Existing Phase 10 SMTP/worker configuration remains unchanged.
- `pdfkit` is already declared in `server/package.json`; Phase 11 does not add an XLSX package.

## Environment

Add or verify:

```env
REPORT_PRIVATE_STORAGE_DIR=./private-uploads/reports
```

The directory must be outside the web server's public/static client root. Restrict filesystem permissions to the API/worker account, back it up according to policy, and configure a retention cleanup process. The implementation sets private file modes on POSIX systems but does not encrypt files at rest. Expiry blocks downloads, but a periodic filesystem cleanup/retention job is still required to physically delete expired files.

Existing `MONGODB_URI`, JWT and mail settings remain required as described in the project README and Phase 10 setup guide.

## Install and run

```bash
cd server
npm install
npm run test:contracts
npm test
npm run dev
```

In a second terminal, start the existing background worker:

```bash
cd server
npm run worker
```

Scheduled reports run inside the existing notification worker. Do not start multiple worker processes unless you have validated the deployment's MongoDB unique indexes and job-claim behavior.

## API client

The existing frontend currently uses the API base constant in `client/js/app.js`. Update that constant for the deployed API host before publishing the client. The frontend is served as static HTML/Tailwind/vanilla JS; no Vite/React build is required.

## Deployment cautions

- Set tenant/branch timezones under organization/branch settings. Invalid IANA timezone values fall back to `Asia/Kolkata`.
- Ensure the private export directory is not exposed by Nginx/Apache static aliases.
- Create/verify indexes before enabling scheduled report workers.
- Scheduled report recipients must be active users in the same tenant. Delivery is in-app only.
- PDF visual rendering was not checked in this environment.
- XLSX export is intentionally unavailable (HTTP 501).
- No payment gateway, webhook or SaaS invoice integration is included.
