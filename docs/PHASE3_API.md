# CareFlow Phase 3 API reference

Base URL: `/api/v1`. Staff APIs require `Authorization: Bearer <access-token>` and a tenant user with the appropriate permission. Patient portal APIs require the same access token/session mechanism but additionally require `role=patient` and a server-linked `patientId`. Doctor staff access is scoped to a Doctor profile linked through `Doctor.userId` and existing appointments/consultations; link the doctor login when creating the Doctor profile.

## Patient staff APIs

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/patients` | `patients.view` | `q`, `page`, `limit`, `status`, `branchId`, `sex`, `from`, `to`, `ageMin`, `ageMax`, `sort` |
| GET | `/patients/settings/registration` | `settings.manage` | Read tenant-required registration fields |
| PATCH | `/patients/settings/registration` | Hospital Admin / `settings.manage` | Configure mandatory fields |
| GET | `/patients/duplicates` | `patients.create` | `phone` and/or `email` |
| POST | `/patients` | `patients.create` | Creates patient; optional `confirmPossibleDuplicate` after a 409 duplicate warning |
| GET | `/patients/:id` | `patients.view` | Clinical fields are permission-filtered |
| PATCH | `/patients/:id` | `patients.edit` | Contact/demographic fields; clinical fields require clinical permission |
| DELETE | `/patients/:id` | `patients.delete` | Archive only |
| POST | `/patients/:id/restore` | `patients.edit` | Restore archive |
| GET | `/patients/:id/summary` | `patients.view` | Counts and balance summary |
| GET/POST | `/patients/:id/medical-history` | `clinical.notes` | Read/add clinical history |
| GET/POST | `/patients/:id/notes` | `clinical.notes` | Read/add clinical notes |
| POST | `/patients/:id/documents` | `clinical.notes` | Multipart field `file`; optional `category` |
| GET | `/patients/:id/documents` | `clinical.notes` | Metadata only |
| GET | `/patients/:id/documents/:documentId/download` | `clinical.notes` | Authenticated private file stream |
| POST/GET | `/patients/:id/photo` | `patients.edit` / `patients.view` | Multipart upload / authenticated private image stream |
| GET | `/patients/:id/activity` | `patients.view` | Audit events associated with patient record ID |
| POST | `/patients/:id/invite-portal` | `patients.edit` | Sends invite only when SMTP is configured |
| GET | `/patients/:id/profile-change-requests` | `patients.edit` | Review queue |
| GET | `/prescriptions` | `clinical.notes` | List branch-scoped prescriptions |
| POST | `/prescriptions` | Doctor / Hospital Admin | Create prescription draft |
| POST | `/prescriptions/:id/finalize` | Authoring doctor / Hospital Admin | Finalize and release prescription
| POST | `/patients/:id/profile-change-requests/:requestId/review` | `patients.edit` | Body: `status=approved|rejected`, optional `reviewNote` |

## Patient portal APIs

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/patient-portal/accept-invitation` | Public, invitation token | Body: `token`, `password`, optional `name` |
| GET | `/patient-portal/dashboard` | Patient account | Only linked patient's dashboard data |
| GET/PATCH | `/patient-portal/profile` | Patient account | PATCH creates a review request |
| GET | `/patient-portal/appointments` | Patient account | Own appointment history |
| POST | `/patient-portal/appointments/:id/cancel` | Patient account | Scheduled appointments only; tenant cancellation window applies |
| GET | `/patient-portal/prescriptions` | Patient account | Finalized only |
| GET | `/patient-portal/lab-reports` | Patient account | Verified only |
| GET | `/patient-portal/invoices` | Patient account | Own invoices |
| GET | `/patient-portal/documents` | Patient account | Metadata for own shared documents |
| GET | `/patient-portal/invoices/:id/payments` | Patient account | Payments for own invoice |
| GET | `/patient-portal/notifications` | Patient account | Own notifications |
| PATCH | `/patient-portal/notifications/:id/read` | Patient account | Own notification only |
| GET | `/patient-portal/documents/:id/download` | Patient account | Own patient document only |

## Response conventions

Successful responses use `{ success: true, data, ... }`. Validation failures use HTTP 422, missing/unauthorized records use 404 or 403 as appropriate, duplicate conflicts use 409, and file size violations use 413. Patient listing returns `pagination: { page, limit, total, pages }`.

## File upload constraints

Only PDF, JPEG and PNG files are accepted for patient documents. Patient photos accept JPEG and PNG. Maximum file size is 10 MB. The server validates basic file signatures and stores files in a private server directory. No static/public file URL is returned.
