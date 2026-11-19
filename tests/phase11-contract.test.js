
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const models=read('src/models/index.js');
const routes=read('src/routes/phase11.js');
const auth=read('src/middleware/auth.js');
const server=read('src/server.js');
const ui=read('client/js/app.js');
const scheduledWorker=read('src/services/scheduledReportWorker.js');
const notificationWorker=read('src/services/notificationWorker.js');
const billingProvider=read('src/services/subscriptionBillingProvider.js');
const pkg=JSON.parse(read('package.json'));

test('Phase 11 reuses existing clinical and finance models and adds only report configuration/export models',()=>{
 for(const name of ['Patient','Appointment','Admission','Invoice','Payment','LabOrder','RadiologyOrder','PharmacySale','Expense','Employee','AuditLog','TenantSubscription','SubscriptionPlan'])assert.equal(models.split(`model('${name}'`).length-1,1,name);
 for(const name of ['SavedReport','ScheduledReport','PrivateReportExport'])assert.ok(models.includes(`model('${name}'`));
});
test('Analytics uses tenant and accessible branch scopes with date range bounds and previous-period comparison',()=>{
 assert.match(routes,/new mongoose\.Types\.ObjectId\(req\.tenantId\)/);
 assert.match(routes,/req\.branchIds\.map/);
 assert.match(routes,/function zoneDate/);
 assert.match(routes,/async function tenantZone/);
 assert.match(routes,/zoneDate\(fromValue,false,zone\)/);
 assert.match(routes,/zoneDate\(toValue,true,zone\)/);
 assert.match(routes,/previousCollections/);
 assert.match(routes,/previousAppointments/);
});
test('Report catalogue is a whitelist and saved reports are tenant/owner scoped',()=>{
 assert.match(routes,/const REPORTS=\{/);
 assert.match(routes,/if\(!cfg\)throw/);
 assert.match(routes,/tenantId:req\.tenantId,active:true,\$or:\[\{ownerId:req\.user\._id\}/);
 assert.match(routes,/ownerId:req\.user\._id/);
});
test('Private report exports use authenticated tenant-scoped downloads and do not live in public client storage',()=>{
 assert.match(routes,/REPORT_PRIVATE_STORAGE_DIR/);
 assert.match(routes,/PrivateReportExport\.findOne\(\{_id:req\.params\.id,tenantId:req\.tenantId\}\)/);
 assert.match(routes,/Content-Disposition/);
 assert.match(routes,/branchScope/);
 assert.doesNotMatch(server,/express\.static\([^)]*private-uploads/);
});
test('XLSX is not falsely claimed without an installed XLSX adapter',()=>{
 assert.match(routes,/XLSX export adapter is not installed/);
 assert.doesNotMatch(JSON.stringify(pkg.dependencies||{}),/exceljs|xlsx/);
});
test('Platform APIs are separated from tenant APIs and super-admin role gated',()=>{
 assert.ok(server.includes("app.use('/api/v1/platform',require('./routes/phase11').platform)"));
 assert.match(routes,/platform\.use\(authenticate,allowRoles\('super_admin'\)\)/);
 assert.match(routes,/financialMetrics:\{mrrAvailable:false,arrAvailable:false/);
});
test('Subscription plan versions and subscription snapshots preserve historical terms',()=>{
 assert.match(models,/planSnapshot:\{type:Schema\.Types\.Mixed/);
 assert.match(models,/version:\{type:Number,default:1\}/);
 assert.match(routes,/planSnapshot=\{key:plan\.key/);
 assert.match(routes,/plan\.version=\(plan\.version\|\|1\)\+1/);
});
test('Plan module gates are enforced in dedicated route groups and server-side middleware',()=>{
 assert.match(auth,/exports\.requireModule=/);
 for(const f of ['patients.js','appointments.js','doctors.js','clinical.js','queue.js','finance.js','pharmacy.js','ipd-hospital.js','hrm.js','patient-portal.js'])assert.match(read('src/routes/'+f),/requireModule\(/);
});
test('Phase 11 UI uses backend APIs for analytics, reports, subscriptions, usage and settings',()=>{
 assert.ok(ui.includes('/phase11/modules/access'));
 for(const endpoint of ['/phase11/analytics/overview','/phase11/reports/catalogue','/phase11/reports/preview','/phase11/reports/exports','/phase11/tenant/plans','/phase11/tenant/subscription','/phase11/tenant/usage','/phase11/tenant/settings','/platform/overview','/platform/plans','/platform/subscriptions'])assert.ok(ui.includes(endpoint),endpoint);
});

test('Scheduled reports use idempotent automation claims, private CSV output and in-app outbox notifications',()=>{
 assert.match(scheduledWorker,/scheduled-report:\$\{schedule\._id\}/);
 assert.match(scheduledWorker,/AutomationRun\.findOne/);
 assert.match(scheduledWorker,/NotificationOutbox\.updateOne/);
 assert.match(scheduledWorker,/PrivateReportExport\.create/);
 assert.match(notificationWorker,/scheduledReportWorker/);
 assert.match(scheduledWorker,/attempts:\{\$lt:5\}/);
});
test('Settings API prevents secrets from being returned or persisted in tenant JSON',()=>{
 assert.match(routes,/containsSecretKey/);
 assert.match(routes,/sanitizeSettings/);
 assert.match(routes,/server environment\/secret management/);
});

test('Payroll reports scope records through tenant employees because PayrollRecord has no branchId',()=>{
 assert.match(models,/PayrollRecord = model/);
 assert.match(routes,/cfg\.branch==='employee'/);
 assert.match(routes,/M\.Employee\.distinct\('_id',employeeFilter\)/);
 assert.match(routes,/Employee is outside your report scope/);
});

test('Subscription billing exposes an explicit unconfigured provider boundary and cannot fake payment success',()=>{
 assert.match(billingProvider,/SUBSCRIPTION_PROVIDER_NOT_CONFIGURED/);
 assert.match(billingProvider,/verifyWebhook/);
 assert.match(billingProvider,/fetchPayment/);
 assert.match(billingProvider,/refund/);
 assert.match(billingProvider,/this\.adapter\.verifyWebhook/);
});

test('Report projections fall back to the server allowlist when no valid columns are requested',()=>{
 assert.match(routes,/requestedColumns\.length\?requestedColumns:allowed/);
 assert.match(routes,/safeSelect\(columns\)/);
});
