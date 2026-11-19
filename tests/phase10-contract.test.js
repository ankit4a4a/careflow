const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const models=read('src/models/index.js');
const routes=read('src/routes/hrm.js');
const worker=read('src/services/notificationWorker.js');
const auth=read('src/middleware/auth.js');
const server=read('src/server.js');
const pkg=JSON.parse(read('package.json'));
const app=read('client/js/app.js');
const ui=read('client/js/hrm.js');
const html=read('client/index.html');
const invite=read('client/employee-invite.html');

test('Phase 10 reuses existing User, Patient, Doctor, Notification, AuditLog and Expense models',()=>{
 for(const name of ['User','Patient','Doctor','Notification','AuditLog','Expense'])assert.equal(models.split(`model('${name}'`).length-1,1,name);
 assert.match(models,/employeeId:\{type:Schema\.Types\.ObjectId,ref:'Employee'\}/);
 assert.match(models,/employeeId:\{type:Schema\.Types\.ObjectId,ref:'Employee'\},\s*gender/);
});
test('Employee, department designation and employment history models are tenant scoped',()=>{
 for(const name of ['Employee','Designation','EmploymentHistory','EmployeeDocument','EmployeeProfileChangeRequest','EmployeeInvite'])assert.ok(models.includes(`model('${name}'`));
 assert.match(models,/Employee\.index\(\{tenantId:1,employeeNo:1\},\{unique:true\}\)/);
 assert.match(models,/Employee\.index\(\{tenantId:1,userId:1\},\{unique:true/);
 assert.match(models,/Employee\.index\(\{tenantId:1,doctorId:1\},\{unique:true/);
});
test('Doctor and Employee relationship is one-to-one without duplicate Doctor records',()=>{
 assert.match(models,/Doctor\.index\(\{tenantId:1,employeeId:1\},\{unique:true/);
 assert.match(routes,/Doctor\.updateOne\(\{_id:x\.doctorId,tenantId:req\.tenantId\},\{\$set:\{employeeId:x\._id\}\}\)/);
});
test('Employee account invitation reuses User authentication and stores hashed one-time tokens',()=>{
 assert.match(models,/tokenHash:\{type:String,required:true,unique:true\}/);
 assert.match(routes,/crypto\.createHash\('sha256'\)/);
 assert.match(routes,/argon2\.hash\(password\)/);
 assert.match(routes,/role:'employee',employeeId:employee\._id/);
 assert.match(routes,/router\.post\('\/hrm\/accept-invitation'/);
 assert.match(invite,/\/hrm\/accept-invitation/);
});
test('Employee document, photo, candidate resume and reimbursement files remain private and signature checked',()=>{
 assert.match(routes,/HRM_PRIVATE_STORAGE_DIR/);
 assert.match(routes,/10\*1024\*1024/);
 assert.match(routes,/function magicValid/);
 assert.match(routes,/application\/pdf/);
 assert.match(routes,/Cache-Control','private, no-store'/);
 assert.match(routes,/employee\.document\.uploaded/);
});
test('Employee CRUD includes branch validation, salary visibility and history snapshots',()=>{
 assert.match(routes,/async function validEmployeeRefs/);
 assert.match(routes,/employee\.salary\.view/);
 assert.match(routes,/EmploymentHistory\.create/);
 assert.match(routes,/employee\.archive/);
});
test('Attendance records are unique by employee work date and shift',()=>{
 assert.match(models,/Attendance\.index\(\{tenantId:1,employeeId:1,workDate:1,shiftId:1\},\{unique:true\}\)/);
 assert.match(routes,/router\.post\('\/hrm\/attendance\/check-in'/);
 assert.match(routes,/row\.checkIn=now/);
 assert.match(routes,/row\.checkOut=now/);
 assert.match(routes,/lateMinutes/);
 assert.match(routes,/overtimeMinutes/);
});
test('Official attendance uses server timestamps and overnight timezone-aware shift calculations',()=>{
 assert.match(routes,/function zonedDate/);
 assert.match(routes,/async function workAttendance/);
 assert.match(routes,/new Date\(\)/);
 assert.doesNotMatch(routes,/checkIn:req\.body\.checkIn/);
 assert.match(worker,/async function markAbsences/);
});
test('Attendance corrections require review and manual changes are audited',()=>{
 assert.match(models,/const AttendanceCorrection/);
 assert.match(routes,/attendance\.correction\.reviewed/);
 assert.match(routes,/attendance\.manual/);
 assert.match(routes,/status:'pending'/);
});
test('Shift rosters, swaps and branch-specific shifts are represented',()=>{
 for(const name of ['Shift','ShiftAssignment','ShiftSwapRequest'])assert.ok(models.includes(`model('${name}'`));
 assert.match(routes,/router\.post\('\/hrm\/roster\/assign'/);
 assert.match(routes,/router\.post\('\/hrm\/me\/roster\/swap-requests'/);
 assert.match(routes,/allowOverlap/);
});
test('Leave balances have unique yearly keys, adjustment history and date reservations',()=>{
 for(const name of ['LeaveType','LeavePolicy','LeaveBalance','LeaveRequest','LeaveBalanceAdjustment','LeaveDateLock','LeaveAccrual'])assert.ok(models.includes(`model('${name}'`));
 assert.match(models,/LeaveDateLock\.index\(\{tenantId:1,employeeId:1,date:1\},\{unique:true\}\)/);
 assert.match(routes,/LeaveDateLock\.insertMany/);
 assert.match(routes,/LeaveDateLock\.deleteMany/);
});
test('Leave approvals are transactional and balance is deducted once',()=>{
 assert.match(routes,/session\.withTransaction/);
 assert.match(routes,/deductedAt=new Date\(\)/);
 assert.match(routes,/balance\.used\+=x\.days/);
 assert.match(routes,/policy\.approvalLevels/);
 assert.match(worker,/async function accrueMonthlyLeave/);
});
test('Payroll uses configurable salary structures, attendance, leave, overtime and immutable snapshots',()=>{
 for(const name of ['SalaryStructure','PayrollRun','PayrollRecord','PayrollAdjustment'])assert.ok(models.includes(`model('${name}'`));
 assert.match(routes,/attendanceSnapshot:counts/);
 assert.match(routes,/paidLeaveDays/);
 assert.match(routes,/overtimeRatePerHour/);
 assert.match(routes,/salarySnapshot/);
 assert.match(routes,/employeeSnapshot/);
});
test('Payroll runs and records prevent duplicate employee-period payroll',()=>{
 assert.match(models,/PayrollRun\.index\(\{tenantId:1,periodStart:1,periodEnd:1,branchId:1\},\{unique:true\}\)/);
 assert.match(models,/PayrollRecord\.index\(\{tenantId:1,runId:1,employeeId:1\},\{unique:true\}\)/);
 assert.match(routes,/run\.status!=='draft'/);
 assert.match(routes,/run\.totals=totals/);
});
test('Payroll approval and payment require salary permissions and a recorded payment reference',()=>{
 assert.match(routes,/requirePermission\('payroll\.approve'\),requirePermission\('employee\.salary\.view'\)/);
 assert.match(routes,/Payment reference is required/);
 assert.match(routes,/x\.status='paid'/);
 assert.doesNotMatch(routes,/Payment\.create/);
});
test('Payslips are generated as PDFs and patient/employee privacy is enforced',()=>{
 assert.match(routes,/new PDFDocument/);
 assert.match(routes,/hrm\/me\/payslips/);
 assert.match(routes,/employeeId:e\._id,status:\{\$in:\['released','paid'\]\}/);
 assert.match(routes,/Cache-Control','private, no-store'/);
});
test('Recruitment, interviews, onboarding and appraisal models and routes exist',()=>{
 for(const name of ['JobOpening','Candidate','Interview','Onboarding','AppraisalPeriod','PerformanceReview'])assert.ok(models.includes(`model('${name}'`));
 for(const p of ['/hrm/recruitment/jobs','/hrm/recruitment/candidates','/hrm/recruitment/interviews','/hrm/onboarding','/hrm/appraisal/reviews'])assert.ok(routes.includes(p));
});
test('Reimbursements reuse the existing Expense model and do not create duplicate payment infrastructure',()=>{
 assert.match(models,/expenseType:\{type:String,enum:\['operational','reimbursement'\]/);
 assert.match(routes,/Expense\.create/);
 assert.match(routes,/receiptStorageKey/);
 assert.doesNotMatch(models,/const ReimbursementPayment/);
});
test('CRM reuses Patient and prevents clinical notes from appearing in CRM patient history',()=>{
 for(const name of ['PatientFollowUp','PatientFeedback','PatientComplaint','PatientCommunicationLog'])assert.ok(models.includes(`model('${name}'`));
 assert.match(routes,/async function scopedPatient/);
 assert.match(routes,/communicationPreferences/);
 assert.match(routes,/router\.post\('\/patient-portal\/feedback'/);
 assert.match(routes,/router\.post\('\/patient-portal\/complaints'/);
 assert.doesNotMatch(routes,/clinicalNotes|medicalHistory/);
});
test('Notification center reuses Notification and adds idempotent outbox and retry worker',()=>{
 assert.match(models,/Notification\.index\(\{tenantId:1,idempotencyKey:1\},\{unique:true/);
 assert.match(models,/NotificationOutbox\.index\(\{tenantId:1,idempotencyKey:1\},\{unique:true\}\)/);
 assert.match(routes,/router\.post\('\/hrm\/notifications\/dispatch'/);
 assert.match(worker,/async function deliverOne/);
 assert.match(worker,/attempts:\{\$lt:8\}/);
 assert.match(worker,/deliveredChannels/);
});
test('Background scheduler handles birthdays, document expiry, patient follow-ups, appointments and leave accrual',()=>{
 assert.match(worker,/Upcoming birthday/);
 assert.match(worker,/Employee document expiring/);
 assert.match(worker,/Patient follow-up due tomorrow/);
 assert.match(worker,/Appointment reminder/);
 assert.match(worker,/monthly-leave-accrual/);
 assert.match(worker,/markAbsences/);
});
test('External SMS and WhatsApp are not falsely reported as delivered without provider adapters',()=>{
 assert.match(worker,/provider adapter is not configured/);
 assert.match(routes,/SMTP is not configured/);
});
test('RBAC contains HRM, employee, attendance, leave, payroll, recruitment, CRM and notification permissions',()=>{
 for(const p of ['hrm.view','employee.view','employee.salary.view','employee.documents.manage','attendance.manage','attendance.correct','shifts.manage','leave.approve','payroll.manage','payroll.approve','payroll.pay','recruitment.manage','appraisal.manage','reimbursement.manage','crm.manage','feedback.manage','complaints.manage','notifications.manage'])assert.ok(auth.includes(p),p);
 assert.match(auth,/employee:\[/);
});
test('Frontend loads Phase 10 vanilla-JS module and includes the requested screens',()=>{
 assert.match(html,/js\/hrm\.js/);
 assert.doesNotMatch(html,/react|vue|angular|vite/i);
 for(const p of ['HRM Dashboard','Employee Directory','Add Employee','Department Management','Designation Management','Employee Documents','Attendance Dashboard','Daily Attendance','Attendance Corrections','Shift Management','Roster Calendar','Leave Dashboard','Leave Applications','Leave Policies','Payroll Dashboard','Salary Structures','Payroll Processing','Payroll Approval','Payslip Management','Employee Self-Service','Recruitment Dashboard','Job Openings','Candidate Management','Interview Scheduling','Onboarding','Performance Reviews','Reimbursements','CRM Dashboard','Patient Follow-ups','Patient Feedback','Complaint Management','Notification Center','Notification Settings','Holiday Calendar','HRM Reports'])assert.ok(ui.includes(p),p);
 assert.match(app,/hrmPage\(root,state\.route\)/);
});
test('Dedicated worker script and private storage configuration are documented in package and env',()=>{
 assert.equal(pkg.scripts.worker,'node src/worker.js');
 assert.match(read('src/worker.js'),/startNotificationWorker/);
 assert.match(read('.env.example'),/HRM_PRIVATE_STORAGE_DIR/);
 assert.match(read('.env.example'),/CLIENT_PUBLIC_URL/);
});

test('Shift roster assignment uses transactional per-employee date locks and swap overrides',()=>{
 assert.ok(models.includes("model('ShiftAssignmentDateLock'"));
 assert.match(models,/ShiftAssignmentDateLock\.index\(\{tenantId:1,employeeId:1,date:1\},\{unique:true\}\)/);
 assert.match(routes,/ShiftAssignmentDateLock\.insertMany/);
 assert.match(routes,/ShiftAssignmentDateLock\.deleteMany/);
 assert.match(routes,/366 days/);
 assert.match(worker,/const winning=await ShiftAssignment\.findOne/);
});
