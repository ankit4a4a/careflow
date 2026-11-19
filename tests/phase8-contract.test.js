const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const models=read('src/models/index.js');
const routes=read('src/routes/laboratory-radiology.js');
const server=read('src/server.js');
const auth=read('src/middleware/auth.js');
const app=read('client/js/app.js');
const ui=read('client/js/diagnostics.js');
const html=read('client/index.html');

test('Phase 8 extends the existing LabOrder model rather than defining a duplicate',()=>{
 assert.match(models,/const LabOrder = model\('LabOrder'/);
 assert.equal((models.match(/model\('LabOrder'/g)||[]).length,1);
 for(const field of ['consultationId','items','priority','idempotencyKey','sampleIds','verifiedBy'])assert.match(models,new RegExp(`${field}:`));
});
test('Laboratory catalogue, package, sample, result and alert models are tenant scoped',()=>{
 for(const name of ['LabTestCategory','LabTest','LabTestPackage','LabSample','LabResult','CriticalResultAlert'])assert.ok(models.includes(`model('${name}'`));
 assert.match(models,/LabSample\.index\(\{tenantId:1,sampleId:1\}/);
 assert.match(models,/LabResult\.index\(\{tenantId:1,orderId:1,testId:1\}/);
});
test('Samples have tenant-scoped idempotency keys and barcode labels',()=>{
 assert.match(models,/LabSample\.index\(\{tenantId:1,idempotencyKey:1\}/);
 assert.match(routes,/Idempotency-Key header is required/);
 assert.match(routes,/code39=/);
 assert.match(routes,/010010100/);
});
test('Radiology models include catalogue, orders, schedules, slot locks, imaging and reports',()=>{
 for(const name of ['RadiologyService','RadiologyOrder','RadiologySchedule','RadiologySlotLock','ImagingStudy','RadiologyReport'])assert.ok(models.includes(`model('${name}'`));
 assert.match(models,/RadiologySlotLock\.index\(\{tenantId:1,branchId:1,resourceKey:1,slotStart:1\},\{unique:true\}\)/);
});
test('Phase 8 routes are mounted before the legacy billing router so upgraded source-charge handlers take precedence',()=>{assert.match(server,/routes\/laboratory-radiology/);assert.ok(server.indexOf('routes\/laboratory-radiology')<server.indexOf('routes\/finance'));});
test('Laboratory APIs include catalogue, orders, samples, results, verification and release',()=>{
 for(const path of ['/laboratory/tests','/laboratory/packages','/lab-orders','/laboratory/samples','/laboratory/results','/laboratory/critical-alerts'])assert.ok(routes.includes(path),path);
 assert.match(routes,/Self-verification is prohibited/);
 assert.match(routes,/Legacy verification is disabled/);
});
test('Sample transitions append immutable-style chronological event records',()=>{
 assert.match(routes,/previousStatus:previous,newStatus:next,userId:req\.user\._id,at:now/);
 assert.match(routes,/recollectOf:old\._id/);
});
test('Reference ranges are selected by patient age and sex and snapshotted into results',()=>{
 assert.match(routes,/minAgeDays/);
 assert.match(routes,/r\.sex==='any'\|\|r\.sex===sex/);
 assert.match(routes,/referenceRange:range\?\.display/);
});
test('Critical result alerts are generated from configured critical thresholds and gate release',()=>{
 assert.match(routes,/critical_low','critical_high/);
 assert.match(routes,/CriticalResultAlert\.create/);
 assert.match(routes,/Every critical result must have a recorded alert acknowledgement before release/);
});
test('Radiology schedule overlap is protected by unique 5-minute slot locks in a transaction',()=>{
 assert.match(routes,/withTransaction\(async\(\)=>\{s=/);
 assert.match(routes,/RadiologySlotLock\.insertMany/);
 assert.match(routes,/Equipment is already booked for an overlapping time slot/);
});
test('Reports are only available through patient portal when released',()=>{
 assert.match(routes,/patientId:req\.user\.patientId,status:'released'/);
 assert.match(routes,/patient-portal\/diagnostic-reports/);
});
test('PDF generation exists for released laboratory and radiology reports',()=>{
 assert.match(routes,/laboratory\/results\/:id\/pdf/);
 assert.match(routes,/radiology\/reports\/:id\/pdf/);
 assert.match(routes,/new PDFDocument/);
});
test('Billing reuses Invoice and BillingSourceLink rather than a parallel payment model',()=>{
 assert.match(routes,/BillingSourceLink\.create/);
 assert.match(routes,/Invoice\.create/);
 assert.match(routes,/source-charges\/lab-orders/);
 assert.match(routes,/source-charges\/radiology-orders/);
});
test('Clinical consultation workspace exposes lab and imaging order actions',()=>{
 assert.match(app,/new-lab-from-consult/);
 assert.match(app,/new-rad-from-consult/);
 assert.match(ui,/consultationLabOrderModal/);
 assert.match(ui,/consultationRadiologyOrderModal/);
});
test('Laboratory and radiology screens are connected to backend API calls',()=>{
 assert.match(ui,/api\(`\/laboratory\/dashboard\?/);
 assert.match(ui,/lab-daily-chart/);
 assert.match(ui,/data-result-order/);
 assert.match(ui,/data-rad-verify/);
 assert.match(ui,/api\(`\/radiology\/dashboard\?/);
 assert.match(ui,/rad-daily-chart/);
 assert.match(ui,/api\('\/lab-orders'/);
 assert.match(ui,/api\('\/radiology\/orders'/);
 assert.match(html,/diagnostics\.js/);
});
test('Radiology permissions are included in existing RBAC defaults',()=>{
 assert.match(auth,/radiology\.view/);
 assert.match(auth,/radiology\.manage/);
});
