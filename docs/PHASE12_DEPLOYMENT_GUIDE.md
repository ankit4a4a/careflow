# Phase 12 deployment guide

## Compatible architecture

- Serve `client/` as static files from a CDN or web server, or serve it from the same origin through a reverse proxy.
- Run `server/` as a Node.js Express service.
- Run the background worker as a separate Node.js process using the same release and environment.
- Use a managed MongoDB replica set for transaction-dependent workflows.
- Store clinical documents, reports and uploads in a private storage volume or (preferred for production) private object storage. Never expose private directories through a static web root.
- Put TLS termination and request-size / connection controls at a trusted reverse proxy.

No provider is mandated. A static-only hosting service cannot run the Express API or background worker.

## Prerequisites

- Node.js version satisfying `server/package.json` (`>=20.19.0`).
- MongoDB replica set (transactions are used by critical flows).
- A persistent private storage location with restrictive service-account permissions, unless a storage adapter is implemented for object storage.
- SMTP only if email workflows are enabled.
- Domain, DNS and HTTPS configured before real patient data is used.

## Install and verify

```bash
cd server
npm ci
npm run test:contracts
npm test
```

`npm ci` requires a committed `package-lock.json`. If the repository does not contain one, use `npm install` once in a controlled development environment, review the lockfile and commit it, then use `npm ci` for repeatable deployments. Do not claim deployment validation until commands complete successfully.

## Database and startup

1. Create a dedicated MongoDB database user with least-privilege access to the CareFlow database.
2. Configure `MONGODB_URI` with the replica-set name and TLS options required by the provider.
3. Back up the database before release and before any migration script.
4. Run the existing index/model initialization using the project's established startup procedure; confirm required indexes are actually present in the target database.
5. Create the first platform administrator only through the existing `npm run create-super-admin` script after reviewing its prompts and environment requirements.
6. Start API: `npm start`.
7. Start worker separately: `npm run worker`.
8. Configure reverse proxy and health checks. `/api/v1/health` is a basic process endpoint, not a full dependency readiness check.

## Frontend

The client is plain HTML/CSS/Vanilla JS. There is no Vite/React build. Configure the API base URL in `client/js/app.js` for the production API origin, then serve the `client/` directory as static content. Restrict CORS `CLIENT_ORIGIN` to the exact browser origin(s).

## Production environment safeguards

- Set `NODE_ENV=production`.
- Set `COOKIE_SECURE=true` behind HTTPS.
- Use a high-entropy `JWT_ACCESS_SECRET` of at least 32 characters (prefer 64+ random bytes encoded as hex/base64).
- Never commit `.env` or credentials.
- Set `REQUIRE_EMAIL_VERIFICATION=true` if the deployment requires verified email before login.
- Keep `ENABLE_INLINE_WORKERS=false` when running the dedicated worker process.
- Keep private storage outside `client/` and block direct web-server access.
- Configure trusted proxy behavior deliberately before relying on `req.ip` for rate limits and audit events.
- Configure process supervision, restart policy, log retention, alerts and resource limits.

## Deployment commands

These commands correspond to scripts present in `server/package.json`:

```bash
cd server
npm start
npm run worker
npm run test:contracts
npm test
npm run create-super-admin
```

`npm run dev` is development-only. `npm run seed` is not a production migration and must not be run against a live tenant database without reviewing its implementation and target database.

## Rollback

1. Stop API and worker processes.
2. Preserve logs and the current release artifact.
3. Restore the database only if the release changed persisted data incompatibly; otherwise roll back application code first.
4. Restore private files from the matching backup if needed.
5. Re-deploy the previous verified application release and run smoke/health checks.
6. Document incident scope and reconcile any transactions performed during the release window.

No deployment was performed as part of Phase 12.
