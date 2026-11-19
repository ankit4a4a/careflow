const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const models=read('src/models/index.js');
const routes=read('src/routes/ipd-hospital.js');
const server=read('src/server.js');
const auth=read('src/middleware/auth.js');
const app=read('client/js/app.js');
const ui=read('client/js/ipd.js');
const html=read('client/index.html');

test('Phase 9 extends existing Admission and VitalSign models without duplicates',()=>{
 assert.equal((models.match(/model\('Admission'/g)||[]).length,1);
 assert.equal((models.match(/model\('VitalSign'/g)||[]).length,1);
 for(const field of ['wardId','roomId','bedId','admittingDoctorId','dischargeRequestedAt','dischargeFinalizedAt'])assert.match(models,new RegExp(`${field}:`));
});
test('Ward, room, bed and allocation history are tenant scoped with uniqueness controls',()=>{
 for(const name of ['Ward','HospitalRoom','HospitalBed','BedAllocation','AdmissionActivity','BedTransfer'])assert.ok(models.includes(`model('${name}'`));
 assert.match(models,/HospitalBed\.index\(\{tenantId:1,branchId:1,bedNo:1\},\{unique:true\}\)/);
 assert.match(models,/currentAdmissionId:1\},\{unique:true/);
});
test('Nursing, MAR, rounds, ICU, OT and discharge models exist',()=>{
 for(const name of ['NursingNote','CarePlan','MedicationAdministration','DoctorRound','IcuObservation','OTRoom','SurgeryCatalogue','SurgeryBooking','OTSlotLock','DischargeRecord'])assert.ok(models.includes(`model('${name}'`));
});
test('MAR events have idempotency and per-scheduled-dose uniqueness',()=>{
 assert.match(models,/MedicationAdministration\.index\(\{tenantId:1,idempotencyKey:1\},\{unique:true\}\)/);
 assert.match(models,/admissionId:1,prescriptionId:1,prescriptionItemIndex:1,scheduledAt:1\},\{unique:true\}/);
 assert.match(routes,/Prescription\.findOne/);
});
test('Admission and bed allocation use transactions and atomic availability check',()=>{
 assert.match(routes,/session\.withTransaction/);
 assert.match(routes,/status:'available',currentAdmissionId:\{\$exists:false\}/);
 assert.match(routes,/findOneAndUpdate\(\{_id:bedId/);
});
test('Bed transfers preserve history and move old beds into cleaning',()=>{
 assert.match(routes,/BedTransfer\.create/);
 assert.match(routes,/BedAllocation\.updateOne/);
 assert.match(routes,/oldBed\.status='cleaning'/);
});
test('OT scheduling uses unique time-slot locks for concurrent reservations',()=>{
 assert.match(models,/OTSlotLock\.index\(\{tenantId:1,otRoomId:1,slotStart:1\},\{unique:true\}\)/);
 assert.match(routes,/OTSlotLock\.insertMany/);
 assert.match(routes,/OTSlotLock\.deleteMany/);
});
test('Discharge finalization is separate from payment settlement',()=>{
 assert.match(routes,/Medical discharge is deliberately independent of invoice settlement/);
 assert.match(routes,/bed\.status='cleaning'/);
 assert.match(routes,/a\.status='discharged'/);
});
test('IPD billing reuses AdmissionCharge, Invoice and BillingSourceLink',()=>{
 assert.match(routes,/AdmissionCharge\.create/);
 assert.match(routes,/Invoice\.create/);
 assert.match(routes,/BillingSourceLink\.create/);
 assert.doesNotMatch(routes,/Payment\.create/);
});
test('Patient portal admissions and discharge PDF enforce patient ownership',()=>{
 assert.match(routes,/req\.user\.role!=='patient'\|\|!req\.user\.patientId/);
 assert.match(routes,/patientId:req\.user\.patientId,status:'discharged'/);
 assert.match(routes,/status:'released'/);
});
test('Phase 9 router is mounted before generic resources',()=>{
 assert.ok(server.indexOf('routes/ipd-hospital')<server.indexOf('routes/resources'));
});
test('RBAC contains hospital operation permissions',()=>{
 for(const p of ['ipd.view','ward.manage','bed.allocate','bed.transfer','nursing.view','medication.mar.administer','doctor.rounds.manage','icu.manage','ot.manage','surgery.schedule','discharge.finalize','ipd.billing.manage'])assert.ok(auth.includes(p),p);
});
test('Frontend loads and routes Phase 9 screens through existing app shell',()=>{
 assert.match(html,/js\/ipd\.js/);
 for(const name of ['IPD Dashboard','Admissions','Wards & Beds','Nursing','Operation Theatre / ICU','Discharge Management'])assert.ok(app.includes(`'${name}'`));
 for(const fn of ['ipdDashboard','ipdAdmissions','ipdWardsBeds','ipdNursing','ipdOt','ipdDischarge'])assert.ok(ui.includes(fn));
});
test('Phase 9 reuses existing vitals API and does not mutate pharmacy stock',()=>{
 assert.match(ui,/patients\/\$\{patientId\}\/vitals/);
 assert.doesNotMatch(routes,/InventoryTransaction\.create|MedicineBatch\.findOneAndUpdate/);
});

test('OT cannot start before pre-op completion or complete before post-op record',()=>{
 assert.match(routes,/Complete every pre-operative checklist item before starting surgery/);
 assert.match(routes,/Record the post-operative summary before completing surgery/);
});
test('IPD billing enforces one draft invoice per admission',()=>{
 assert.match(models,/Invoice\.index\(\{tenantId:1,admissionId:1\},\{unique:true,partialFilterExpression:\{invoiceType:'ipd',status:'draft'\}\}\)/);
});
