# Phase 12 API changes

## Existing API behavior changes

- Patient document download (`GET /api/v1/patients/:id/documents/:documentId/download`) now resolves `storageKey` through a safe private-storage path validator. Invalid keys return the existing not-found response. Response includes `Cache-Control: private, no-store`.
- Patient photo retrieval (`GET /api/v1/patients/:id/photo`) uses the safe private-storage resolver.
- Patient portal document download (`GET /api/v1/patient-portal/documents/:id/download`) uses the same safe resolver and sends `Cache-Control: private, no-store`.
- Patient photo replacement safely resolves the prior photo key before attempting deletion.
- Refresh (`POST /api/v1/auth/refresh`): when a revoked, unexpired refresh token is replayed, all remaining active sessions for that user are revoked, `tokenVersion` is incremented, and an audit event `auth.refresh_token_reuse_detected` is written. The request receives HTTP 401 with a generic expired/revoked message.

## New API routes

No new public API routes were added in Phase 12.

## Compatibility

No frontend framework, API prefix, route group or data model was replaced. Existing valid file keys and refresh-token clients retain the normal successful flow. Refresh-token replay intentionally signs the user out of all sessions.
