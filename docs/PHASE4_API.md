# CareFlow Phase 4 API reference

Base path: `/api/v1`. All staff endpoints require an existing access token, active server-side session, tenant membership and the named permission. Branch-scoped users are restricted to their assigned branch IDs. Patient endpoints are mounted under `/patient-portal` and derive the patient identity from the authenticated `User.patientId` link.

## Doctor directory and profile

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/doctors` | Server-side paginated directory; supports `q`, `page`, `limit`, `status`, `branchId`, `specialty` |
| POST | `/doctors` | Create doctor profile; generates tenant doctor code |
| GET | `/doctors/:id` | Doctor profile and appointment KPIs |
| PATCH | `/doctors/:id` | Update permitted professional and branch fields |
| PATCH | `/doctors/:id/status` | Activate, deactivate or archive doctor |
| POST | `/doctors/:id/invite` | Create single-use 24-hour doctor account invitation; SMTP delivery is conditional |
| POST | `/doctors/accept-invitation` | Public, rate-limited invitation acceptance using existing User/JWT login architecture |
| POST | `/doctors/:id/photo` | Private JPEG/PNG photo upload (3 MB maximum) |
| GET | `/doctors/:id/photo` | Authenticated private photo stream |
| GET | `/doctors/departments` | List departments visible to the user |
| POST | `/doctors/departments` | Create a tenant department with branch assignments |
| PATCH | `/doctors/departments/:id` | Update department metadata/status |

## Scheduling and leave

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/doctors/:id/schedule` | Read doctor schedules |
| PUT | `/doctors/:id/schedule` | Upsert a weekday/branch recurring schedule with one or more sessions and breaks |
| GET | `/doctors/:id/availability?branchId=...&date=YYYY-MM-DD` | Return available slots in branch local time |
| GET | `/doctors/:id/leaves` | List doctor leave requests |
| POST | `/doctors/:id/leaves` | Doctor leave request (pending) or admin-entered approved leave |
| PATCH | `/doctors/leaves/:leaveId/review` | Approve/reject; approval returns 409 and conflicting appointments if existing visits must be moved first |
| GET | `/doctors/me/schedule` | Linked doctor's own schedule and leave requests |
| GET | `/doctors/me/dashboard` | Linked doctor's own appointments and queue KPIs |

## Appointments

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/appointments` | Paginated appointment list; supports date, status, branch and doctor filters |
| GET | `/appointments/calendar` | Calendar range query; supports `from`, `to`, `branchId`, `doctorId` |
| GET | `/appointments/availability` | Staff availability lookup; requires `doctorId`, `branchId`, `date` |
| POST | `/appointments` | Book only a generated available slot |
| GET | `/appointments/:id` | Appointment details and status history |
| PATCH | `/appointments/:id/status` | Controlled lifecycle transition |
| POST | `/appointments/:id/check-in` | Check in patient and create queue entry |
| POST | `/appointments/:id/reschedule` | Create replacement booking then mark original as rescheduled |
| GET | `/appointments/reschedule-requests` | List pending patient requests (doctor users see only their assigned appointment requests) |
| PATCH | `/appointments/reschedule-requests/:requestId/review` | Approve/reject; approval validates and atomically books the requested slot |

Appointment statuses include legacy `scheduled` plus `booked`, `confirmed`, `checked_in`, `waiting`, `called`, `skipped`, `in_consultation`, `completed`, `cancelled`, `no_show`, and `rescheduled`. Only allowed transitions are accepted by the API.

## Reception queue

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/queue` | Queue by branch, doctor, date and status |
| POST | `/queue/next` | Atomically call the next waiting patient (emergency priority first, then queue number) |
| PATCH | `/queue/:id/status` | Update waiting/called/consultation/completed/skipped/cancelled state |

## Patient portal additions

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/patient-portal/doctors` | Public-safe doctor discovery limited to patient's tenant and registered branch when present |
| GET | `/patient-portal/doctors/:id/availability?branchId=...&date=YYYY-MM-DD` | Patient's permitted doctor slot lookup |
| POST | `/patient-portal/appointments` | Book a slot for the authenticated linked patient only |
| POST | `/patient-portal/appointments/:id/reschedule-request` | Request a new time; clinic approval is required before the appointment changes |

Existing patient appointment cancellation now accepts `scheduled`, `booked`, or `confirmed` records subject to tenant cancellation policy and releases the reserved slot capacity.

## Booking concurrency and schedule behavior

- Availability is generated from active weekday schedules and branch timezone.
- Approved doctor leave and existing conflicting appointments suppress slots.
- `SlotCounter` uses a unique tenant/doctor/branch/start-time key and conditional atomic increment to cap simultaneous reservations. The slot counter, appointment, appointment number sequence and initial status history are committed in one MongoDB transaction; rescheduling also updates the original appointment and releases its old capacity in the same transaction. A MongoDB replica set (including Atlas) is required. For local development, start MongoDB with `mongod --replSet rs0` and initialize it once with `mongosh --eval 'rs.initiate()'`; the sample URI uses `?replicaSet=rs0`.
- New bookings must match a currently generated slot; arbitrary start/end timestamps are not accepted.
- Legacy appointments are still included in overlap checks.
- MongoDB unique indexes must be built successfully before relying on concurrent reservation protection.

## Operational notes

- Doctor photos are stored under the server's private upload directory, not the public client folder. Production should migrate this to encrypted private object storage and malware scanning.
- The queue is API-backed and can be refreshed manually; this build does not claim push/WebSocket real-time delivery.
- Video consultations are only accepted when the doctor's configured consultation types include `video`; no video provider integration is included.
- MongoDB replica-set transactions are required for atomic appointment booking and rescheduling, as well as existing financial workflows.
