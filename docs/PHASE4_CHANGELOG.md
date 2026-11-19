# CareFlow Phase 4 changelog

## Added

- Expanded existing Doctor model and added doctor code generation.
- Added private doctor profile photo upload and authenticated photo streaming.
- Added secure doctor invitation and acceptance; activated accounts reuse the existing User, Argon2, JWT and session system.
- Added Department, DoctorSchedule, DoctorLeave, DoctorInvite, AppointmentRescheduleRequest, SlotCounter, QueueEntry, QueueCounter and AppointmentStatusHistory models.
- Added doctor profile, registration, directory, departments, schedule, availability, leave and dashboard APIs.
- Added schedule-based slot generation with branch timezone handling, break exclusion and approved-leave exclusion.
- Added atomic slot capacity reservation to prevent simultaneous booking of the same configured slot beyond capacity.
- Added appointment calendar/list, booking, controlled status transitions, status history, check-in and rescheduling APIs.
- Added waiting-room queue APIs and patient-side doctor discovery/booking and reschedule requests with staff approval.
- Added doctor directory/profile, department manager, schedule and leave approval, appointment calendar/booking, reception queue, doctor dashboard and patient booking UI.

## Preserved

- Existing CareFlow project structure and HTML/Tailwind/Vanilla JS frontend.
- Existing Express/Mongoose architecture, auth/session model, tenant/branch scoping and audit service.
- Existing Patient, User, Appointment, Consultation and other Phase 1–3 models and APIs.
- Legacy `scheduled` appointment status and doctor records without a status field.

## Verification

- JavaScript syntax checks: passed for all backend/frontend JavaScript files.
- Static Phase 3 + Phase 4 contract tests: 25/25 passed. Full `npm test`: 25 passed, 1 Express smoke-test file failed to load because `dotenv` is unavailable.
- npm dependency installation timed out; runtime/API/MongoDB/browser tests remain unverified.
