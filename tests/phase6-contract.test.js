const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const models=read('src/models/index.js');
const finance=read('src/routes/finance.js');
const auth=read('src/middleware/auth.js');
const server=read('src/server.js');
const portal=read('src/routes/patient-portal.js');
const app=read('client/js/app.js');
const financeUI=read('client/js/finance.js');

test('Phase 6 extends existing invoice and payment models instead of duplicating them',()=>{
 assert.equal((models.match(/model\('Invoice'/g)||[]).length,1);
 assert.equal((models.match(/model\('Payment'/g)||[]).length,1);
 for(const name of ['Service','TaxConfiguration','PatientDeposit','DepositTransaction','Refund','CreditNote','Expense','ChartOfAccount','JournalEntry','LedgerTransaction','AdmissionCharge','BillingSourceLink'])assert.match(models,new RegExp(`model\\('${name}'`));
});
test('Financial routes require authentication and tenant context',()=>{
 assert.match(finance,/router\.use\(authenticate,requireTenant\)/);
 assert.match(finance,/requirePermission\('billing\.view'\)/);
 assert.match(finance,/requirePermission\('billing\.payments'\)/);
});
test('Invoice totals are derived from tenant service and tax configuration',()=>{
 assert.match(finance,/Service\.findOne\(\{_id:raw\.serviceId,tenantId:req\.tenantId,active:true\}\)/);
 assert.match(finance,/TaxConfiguration\.findOne/);
 assert.match(finance,/const total=money\(preDiscount-invoiceDiscount\+tax\)/);
});
test('Finalized invoice edits are restricted and direct cancellation is draft-only',()=>{
 assert.match(finance,/Only draft invoices can be edited/);
 assert.match(finance,/Issued invoices must be corrected using a credit note/);
});
test('Payment collection uses idempotency, transactions and outstanding balance checks',()=>{
 assert.match(finance,/idempotencyKey/);
 assert.match(finance,/withTransaction/);
 assert.match(finance,/Payment exceeds the outstanding balance/);
 assert.match(models,/Payment\.index\(\{tenantId:1,idempotencyKey:1\},\{unique:true,partialFilterExpression/);
});
test('Payment gateway is not accepted as a successful staff-entered payment method',()=>{
 const segment=finance.slice(finance.indexOf("router.post('/invoices/:id/payments'"),finance.indexOf("router.get('/payments'"));
 assert.doesNotMatch(segment,/payment_gateway/);
});
test('Double-entry posting validates equal debits and credits and keeps posted records',()=>{
 assert.match(finance,/Math\.abs\(debit-credit\)>0\.009/);
 assert.match(finance,/LedgerTransaction\.insertMany/);
 assert.ok(finance.includes("router.post('/accounting/journals/:id/reverse'"));
});
test('Patient billing routes are scoped to the authenticated patient',()=>{
 assert.match(portal,/patientId:req\.user\.patientId,status:\{\$in:\['issued'/);
 assert.match(portal,/patientId:req\.user\.patientId,status:\{\$in:/);
 assert.match(portal,/PatientDeposit\.find\(\{tenantId:req\.tenantId,patientId:req\.user\.patientId\}/);
});
test('Billing does not mutate pharmacy inventory',()=>{
 assert.doesNotMatch(finance,/InventoryTransaction\.create|MedicineBatch\.update|quantity:\s*\{\s*\$inc/);
});
test('Finance routes are mounted before legacy generic resources routes',()=>{
 assert.ok(server.indexOf("require('./routes/finance')")<server.indexOf("require('./routes/resources')"));
});
test('Frontend exposes real finance workflows and patient advance access',()=>{
 for(const key of ['financeDashboard','financeServices','financeExpenses','financeReports','financeAccounting','financeRefunds','financeDepositModal','financeIpdModal','financePatientBilling'])assert.match(financeUI,new RegExp(`function ${key}|async function ${key}`));
 assert.match(financeUI,/\/financial\/dashboard/);
 assert.match(financeUI,/\/invoices\/\$\{.*\}\/finalize/);
});
test('Financial permission sets are role based',()=>{
 assert.match(auth,/billing\.services\.manage/);
 assert.match(auth,/billing\.accounting\.view/);
 assert.match(auth,/billing\.refunds\.approve/);
});

test('Phase 6 finance UI loads before the existing app and adds patient billing screens',()=>{
 const html=read('client/index.html');
 assert.ok(html.indexOf('finance.js')<html.indexOf('app.js'));
 assert.match(financeUI,/financePatientBilling/);
 assert.match(portal,/patientId:req\.user\.patientId/);
});
test('Appointment and source billing links prevent duplicate charge creation',()=>{
 assert.match(models,/Invoice\.index\(\{tenantId:1,appointmentId:1\},\{unique:true/);
 assert.match(models,/BillingSourceLink\.index\(\{tenantId:1,sourceType:1,sourceId:1\},\{unique:true\}\)/);
 assert.match(finance,/idempotencyKey:`receive:\$\{key\}`/);
});
