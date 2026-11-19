# Fixes applied
1. models/index.js: `Model.index()` crash -> model() wrapper delegates to schema.index(); `tenantId` ReferenceError -> alias to tenantField.
2. Public auth routes (verify-email, forgot-password, reset-password) moved to routes/auth-public.js, mounted before authenticated routers.
3. middleware/auth.js: onlyKnownRoutes() guard added to every router (no repeated auth / OPD module gating on other modules' URLs; unknown URLs -> 404). authenticate() skips if already authenticated; sets req.sessionId (fixes change-password).
4. server.js: trust proxy (TRUST_PROXY env, default 1).
5. auth.js: cookie sameSite configurable via COOKIE_SAMESITE.
6. client/js/app.js: API URL no longer hardcoded to localhost (window.CF_API_URL, else /api/v1 in production).
7. resources.js: lab-order and admission creation now whitelist fields (no status/release mass-assignment); dashboard revenue/trend aggregates branch-scoped.
Not changed: subscription/trial enforcement, localStorage token, seed credentials, finance/pharmacy/hrm deep review.
8. server.js now serves ../client (express.static + index.html fallback) with a CSP that allows the CDN scripts the UI uses. Run `npm start` in server/ and open http://localhost:4000 .

## Login fix round (port 5010, email + password only)
9. Port is now **5010** everywhere (server/.env, .env.example, server.js default, client API fallback, employee-invite.html, README). Open http://localhost:5010 .
10. Login form now has only **Email + Password** (workspace slug field removed from the UI; a hidden empty `tenantSlug` stays so invite links still work).
11. routes/auth.js `/auth/login`: no longer fails with "email belongs to multiple organizations" - the password decides which account signs in. Email is matched case-insensitively (no gmail-dot stripping mismatch). Audit/lastLogin bookkeeping can no longer break a successful login.
12. server.js: login rate limit counts only FAILED attempts (20 / 15 min); general /auth limit raised 60 -> 300 (/auth/me and /auth/refresh run on every page load).
13. client/js/app.js: first page open no longer shows a false "Dashboard nahi khul paya" error; API falls back to localhost:5010 when opened from file:// or Live Server (5500).
14. services/envAdmin.js: .env admin's organization is re-activated if suspended and its plan snapshot is forced to all modules.
Login (from server/.env):  admin@careflow.com  /  Careflow@12345
Requirements: MongoDB running at MONGODB_URI (server will not start without it). Run:  cd server && npm install && npm start
15. services/envAdmin.js rewritten: if the ADMIN_EMAIL user already exists in ANY organization (old DB data), its password is reset to ADMIN_PASSWORD and it is re-activated; otherwise a new admin is created. Terminal shows "Login ready -> ..." on success or "*** ensureEnvAdmin FAILED ..." with the reason.
16. envAdmin.js: account+password is saved FIRST; org/subscription setup is best-effort (a failure there can no longer leave you without a working login); a self-check prints "Login ready" only if the password really verifies.
17. auth.js: when login fails, the SERVER TERMINAL now prints why (no user with this email in database "<name>" / found N accounts but password mismatch).
18. New command: `npm run reset-admin` (in server/) recreates the .env admin login without starting the web server.
19. envAdmin.js: the .env admin is always a hospital_admin attached to an organization. A tenant-less account with that email (old super_admin/seed data) is attached to the "careflow-demo" organization, fixing the dashboard error "Tenant context required".
20. Deploy (Railway/Render): deploy from the repository ROOT (not Root Directory=server), otherwise ../../client is missing ("ENOENT stat /client/index.html"). Root package.json added (build: cd server && npm install, start: cd server && npm start). server.js now searches several client paths (or CLIENT_DIR) and shows a clear message if the frontend is missing.

21. BIG BUG: middleware/auth.js requireModule() returned a function that was never called, so next() never ran and every request to appointments, doctors, queue, finance, HRM, lab-orders, admissions... hung forever (endless loading, data never saved). Rewritten.
22. config/db.js: finance / pharmacy / HRM / appointments use MongoDB transactions, which fail on a plain local (standalone) mongod. On standalone MongoDB the same code now runs without a transaction instead of failing. Atlas / replica sets still use real transactions.
23. Performance: auth middleware cached tenant status, role permissions and module gating (15 s TTL, AUTH_CACHE_TTL_MS; 0 disables) - about 5 fewer DB queries per API request. Static files get 1 h cache in production. Mongo pool size configurable (MONGO_POOL_SIZE, default 20).
24. Project is now ONE folder: server files moved to the project root (src/, tests/, package.json, .env) next to client/. No more Root Directory / cd server problems on Railway or Render. All 164 contract tests still pass.
