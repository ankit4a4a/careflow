# CareFlow Phase 10 Setup and Release Gates

## 1. Configure environment

1. Extract the complete Phase 10 project.
2. Open `server/` and copy `.env.example` to `.env`.
3. Configure the existing MongoDB replica-set connection string, JWT secrets and existing SMTP credentials.
4. Set:
   - `CLIENT_PUBLIC_URL` to the deployed client base URL, including the scheme.
   - `HRM_PRIVATE_STORAGE_DIR` to a private directory not served by Express/static hosting.
   - `ENABLE_INLINE_WORKERS=false` when running the separate worker process.
5. Update the existing API base URL in `client/js/app.js` and `client/employee-invite.html` for the deployment API URL. The existing app uses a hardcoded local development API URL.

## 2. Install and start

In one terminal:

```bash
cd server
npm install
npm run test:contracts
npm run dev
```

In a second terminal:

```bash
cd server
npm run worker
```

Alternatively, set `ENABLE_INLINE_WORKERS=true` to run the worker within the API process, but do not also start a separate worker unless duplicate processing is intentionally being tested. The outbox and scheduler use database idempotency/leases, but the recommended deployment is a separate worker process.

Serve `client/` using the existing static web server. No React, Vue, Angular, Next.js or Vite build step is used.

## 3. Database and index preparation

- Use MongoDB replica-set topology; transactions are required by invitation acceptance, leave reservation/approval/accrual and shift roster allocation/swap.
- Review existing data and create/verify all Mongoose indexes in staging before production.
- Existing Doctors are not automatically converted into Employees. Create an Employee record for each doctor who is also a staff member, then link `Employee.doctorId` and `Doctor.employeeId` through the employee workflow.
- Configure Branches, Departments, Designations, employee managers and employee accounts.
- Configure salary structures and assign them only to authorized HR/payroll staff.
- Configure LeaveTypes, branch/global LeavePolicies, holidays and weekly offs.
- Configure branch time zones and shifts, then assign employees to a roster.
- Configure SMTP before sending employee account invitations or email notifications.
- Configure notification preferences. SMS/WhatsApp remain unavailable until provider adapters and credentials are implemented.

## 4. Private file storage

`HRM_PRIVATE_STORAGE_DIR` must point to storage outside the public client/static directory. Keep the directory writable by the API service and inaccessible to direct web requests. Back it up securely. The current local storage abstraction does not encrypt files or scan them for malware. Production should use encrypted object storage, KMS-managed keys, antivirus scanning, retention/expiry controls and audited access.

## 5. Employee invitation

1. Create an Employee record and assign its branch.
2. Link a Doctor record if the employee is also a doctor.
3. Ensure the employee email is correct.
4. Use the Invite Account action; SMTP must be configured.
5. The employee opens the private invitation token URL and sets a password.
6. The account is created using existing User/JWT authentication with role `employee`; no second authentication system is introduced.

## 6. HRM configuration order

1. Departments and Designations.
2. Salary structures and salary permissions.
3. Leave types, branch policies and holidays.
4. Shifts, time zones, weekly offs and roster assignments.
5. Employee records and invitation links.
6. Recruitment openings and candidates.
7. Notification preferences and worker startup.
8. CRM follow-up assignment and patient communication preferences.

## 7. Release gates

- Verify replica-set transactions and all unique indexes in staging.
- Test employee self-access, manager branch scope, salary permission and patient CRM restrictions with real roles.
- Test concurrent attendance, shift assignment, leave reservation, payroll run and notification outbox operations.
- Test private upload/download and storage backup/restore.
- Validate salary structures and payroll rules with the organization's payroll/legal advisers; do not assume statutory deductions are implemented.
- Test the employee invitation flow with SMTP and the deployed client/API URLs.
- Test worker restart, stale lease recovery, outbox retry and duplicate-email behavior.
- Inspect payslip PDFs and all responsive screens.
- Confirm SMS/WhatsApp adapters before enabling those channels.
- Review privacy retention, audit access, incident response and backups.
- No DPDP, ABDM, HIPAA, labor-law, payroll or clinical certification is asserted.
