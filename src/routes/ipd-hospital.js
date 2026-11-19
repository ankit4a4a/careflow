const router=require('express').Router();
const mongoose=require('mongoose');
const PDFDocument=require('pdfkit');
const {authenticate,requireTenant,requireModule,requirePermission,allowRoles}=require('../middleware/auth');
const asyncHandler=require('../utils/asyncHandler');
const audit=require('../middleware/audit');
const {
 Ward,HospitalRoom,HospitalBed,BedAllocation,Admission,AdmissionActivity,BedTransfer,
 Patient,Doctor,Department,Branch,User,VitalSign,NursingNote,CarePlan,
 MedicationAdministration,Prescription,DoctorRound,IcuObservation,OTRoom,
 SurgeryCatalogue,SurgeryBooking,OTSlotLock,DischargeRecord,AdmissionCharge,Invoice,Sequence,Service,TaxConfiguration,
 Notification,LabOrder,LabResult,RadiologyOrder,RadiologyReport
}=require('../models');
router.use(require('../middleware/auth').onlyKnownRoutes(router));router.use(authenticate,requireTenant);router.use(requireModule('ipd'));
const {doctorPatientIds}=require('../services/access');
const ADMIN=['hospital_admin','super_admin'];
const isAdmin=req=>ADMIN.includes(req.user.role);
const branchScope=req=>isAdmin(req)?{}:{branchId:{$in:req.branchIds}};
const branchAllowed=(req,id)=>isAdmin(req)||req.branchIds.includes(String(id));
const fail=(res,message,status=400)=>res.status(status).json({success:false,message});
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const idempotency=req=>clean(req.get('Idempotency-Key')||req.body.idempotencyKey,160);
async function transaction(fn){
 const session=await mongoose.startSession();
 try { let result; await session.withTransaction(async()=>{result=await fn(session)}); return result; }
 finally { await session.endSession(); }
}
async function nextNo(tenantId,prefix,session){
 const year=new Date().getFullYear(),key=`${tenantId}:${prefix}:${year}`;
 const seq=await Sequence.findOneAndUpdate({key},{$inc:{value:1}},{new:true,upsert:true,setDefaultsOnInsert:true,session});
 return `${prefix}-${year}-${String(seq.value).padStart(6,'0')}`;
}
async function getPatient(req,id,branchId){
 if(!mongoose.isValidObjectId(id))return null;
 const filter={_id:id,tenantId:req.tenantId};
 if(branchId)filter.branchId=branchId; else if(!isAdmin(req))filter.branchId={$in:req.branchIds};
 return Patient.findOne(filter);
}
async function getAdmission(req,id,session){
 const f={_id:id,tenantId:req.tenantId,...branchScope(req)};
 if(req.user.role==='doctor'){const ids=await doctorPatientIds(req);f.patientId={$in:ids||[]};}
 return Admission.findOne(f).session(session||null);
}
function writeActivity({tenantId,branchId,admissionId,type,description,from,to,reason,userId},session){
 return AdmissionActivity.create([{tenantId,branchId,admissionId,type,description,from,to,reason,createdBy:userId}],{session});
}
router.get('/ipd/dashboard',requirePermission('ipd.view'),asyncHandler(async(req,res)=>{
 const now=new Date(),start=new Date(now);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);
 const scope={tenantId:req.tenantId,...branchScope(req)};if(req.query.branchId){if(!branchAllowed(req,req.query.branchId))return fail(res,'Branch access denied',403);scope.branchId=req.query.branchId;}
 const [admitted,occupied,available,reserved,cleaning,maintenance,todayAdmissions,todayDischarges,awaitingBeds,icu,upcoming,wards]=await Promise.all([
 Admission.countDocuments({...scope,status:{$in:['admitted','discharge_requested']}}),
 HospitalBed.countDocuments({...scope,status:'occupied'}),HospitalBed.countDocuments({...scope,status:'available'}),
 HospitalBed.countDocuments({...scope,status:'reserved'}),HospitalBed.countDocuments({...scope,status:'cleaning'}),
 HospitalBed.countDocuments({...scope,status:'maintenance'}),Admission.countDocuments({...scope,admittedAt:{$gte:start,$lt:end}}),
 Admission.countDocuments({...scope,dischargedAt:{$gte:start,$lt:end}}),Admission.countDocuments({...scope,status:'admitted',bedId:{$exists:false}}),
 Admission.countDocuments({...scope,status:'admitted',ward:/icu/i}),
 Admission.find({...scope,status:'discharge_requested'}).populate('patientId','firstName lastName uhid').sort({dischargeRequestedAt:1}).limit(12).lean(),
 Ward.find({...scope,active:true}).select('name code capacity').lean()
 ]);
 const avg=await Admission.aggregate([{$match:{...scope,status:'discharged',dischargedAt:{$exists:true}}},{$project:{stay:{$divide:[{$subtract:['$dischargedAt','$admittedAt']},86400000]}}},{$group:{_id:null,avg:{$avg:'$stay'}}}]);
 res.json({success:true,data:{admitted,occupied,available,reserved,cleaning,maintenance,todayAdmissions,todayDischarges,awaitingBeds,icu,averageLengthOfStayDays:Math.round((avg[0]?.avg||0)*10)/10,upcomingDischarges:upcoming,wards}});
}));
router.get('/wards',requirePermission('ward.view'),asyncHandler(async(req,res)=>res.json({success:true,data:await Ward.find({tenantId:req.tenantId,...branchScope(req),...(req.query.branchId?{branchId:req.query.branchId}:{})}).sort({name:1}).lean()})));
router.post('/wards',requirePermission('ward.manage'),allowRoles('hospital_admin','branch_admin'),audit('ward.created','ward'),asyncHandler(async(req,res)=>{
 const {branchId,name,code,capacity}=req.body;if(!branchId||!branchAllowed(req,branchId)||!clean(name)||!clean(code)||!Number.isInteger(Number(capacity))||Number(capacity)<1)return fail(res,'Valid branch, name, code and capacity are required');
 const b=await Branch.findOne({_id:branchId,tenantId:req.tenantId,active:true});if(!b)return fail(res,'Branch not found',404);
 const x=await Ward.create({tenantId:req.tenantId,branchId,name:clean(name,120),code:clean(code,24).toUpperCase(),capacity:Number(capacity),type:clean(req.body.type,40)||'general',floor:clean(req.body.floor,40),departmentId:req.body.departmentId||undefined,genderRestriction:['male','female'].includes(req.body.genderRestriction)?req.body.genderRestriction:'any',nursingStation:clean(req.body.nursingStation,80),description:clean(req.body.description,1000),createdBy:req.user._id});
 res.status(201).json({success:true,data:x});
}));
router.patch('/wards/:id',requirePermission('ward.manage'),audit('ward.updated','ward'),asyncHandler(async(req,res)=>{
 const x=await Ward.findOneAndUpdate({_id:req.params.id,tenantId:req.tenantId,...branchScope(req)},{$set:{name:clean(req.body.name,120),type:clean(req.body.type,40),floor:clean(req.body.floor,40),departmentId:req.body.departmentId||null,genderRestriction:req.body.genderRestriction,nursingStation:clean(req.body.nursingStation,80),description:clean(req.body.description,1000),active:req.body.active}},{new:true,runValidators:true});
 if(!x)return fail(res,'Ward not found',404);res.json({success:true,data:x});
}));
router.get('/hospital-rooms',requirePermission('bed.view'),asyncHandler(async(req,res)=>res.json({success:true,data:await HospitalRoom.find({tenantId:req.tenantId,...branchScope(req),...(req.query.wardId?{wardId:req.query.wardId}:{})}).populate('wardId','name code').sort({roomNo:1}).lean()})));
router.post('/hospital-rooms',requirePermission('bed.manage'),audit('room.created','hospital_room'),asyncHandler(async(req,res)=>{
 const {branchId,wardId,roomNo}=req.body;const ward=await Ward.findOne({_id:wardId,tenantId:req.tenantId,...(branchId?{branchId}:branchScope(req))});
 if(!ward||!branchAllowed(req,ward.branchId))return fail(res,'Ward not found or access denied',404);
 const x=await HospitalRoom.create({tenantId:req.tenantId,branchId:ward.branchId,wardId,roomNo:clean(roomNo,30),type:clean(req.body.type,40),floor:clean(req.body.floor,40),capacity:Math.max(1,Number(req.body.capacity)||1),facilities:Array.isArray(req.body.facilities)?req.body.facilities.map(v=>clean(v,80)).slice(0,30):[]});
 res.status(201).json({success:true,data:x});
}));
router.get('/hospital-beds',requirePermission('bed.view'),asyncHandler(async(req,res)=>{
 const f={tenantId:req.tenantId,...branchScope(req)};if(req.query.wardId)f.wardId=req.query.wardId;if(req.query.roomId)f.roomId=req.query.roomId;if(req.query.status)f.status=req.query.status;
 const data=await HospitalBed.find(f).populate('wardId','name code').populate('roomId','roomNo type').populate('currentPatientId','firstName lastName uhid').sort({bedNo:1}).lean();res.json({success:true,data});
}));
router.post('/hospital-beds',requirePermission('bed.manage'),audit('bed.created','hospital_bed'),asyncHandler(async(req,res)=>{
 const room=await HospitalRoom.findOne({_id:req.body.roomId,tenantId:req.tenantId,...branchScope(req)});if(!room)return fail(res,'Room not found',404);
 const ward=await Ward.findOne({_id:room.wardId,tenantId:req.tenantId,active:true});if(!ward)return fail(res,'Active ward not found',404);
 const [roomBeds,wardBeds]=await Promise.all([HospitalBed.countDocuments({tenantId:req.tenantId,roomId:room._id}),HospitalBed.countDocuments({tenantId:req.tenantId,wardId:ward._id})]);if(roomBeds>=room.capacity||wardBeds>=ward.capacity)return fail(res,'Room or ward bed capacity has been reached',409);
 const x=await HospitalBed.create({tenantId:req.tenantId,branchId:room.branchId,wardId:ward._id,roomId:room._id,bedNo:clean(req.body.bedNo,30),category:clean(req.body.category,40),status:'available'});
 res.status(201).json({success:true,data:x});
}));
router.patch('/hospital-beds/:id/status',requirePermission('bed.manage'),audit('bed.status_changed','hospital_bed'),asyncHandler(async(req,res)=>{
 const allowed=['cleaning','maintenance','blocked','available'];if(!allowed.includes(req.body.status))return fail(res,'Unsupported bed status');
 const x=await HospitalBed.findOne({_id:req.params.id,tenantId:req.tenantId,...branchScope(req)});if(!x)return fail(res,'Bed not found',404);
 if(x.currentAdmissionId||x.status==='occupied')return fail(res,'Occupied bed must be transferred or discharged first',409);
 if(req.body.status==='available'&&!['cleaning','maintenance','blocked','reserved','available'].includes(x.status))return fail(res,'Invalid bed transition',409);
 x.status=req.body.status;x.updatedBy=req.user._id;await x.save();res.json({success:true,data:x});
}));
router.get('/admissions',requirePermission('admissions.view'),asyncHandler(async(req,res)=>{
 const f={tenantId:req.tenantId,...branchScope(req)};if(req.user.role==='doctor'){const ids=await doctorPatientIds(req);f.patientId={$in:ids||[]};}if(req.query.status)f.status=req.query.status;
 const data=await Admission.find(f).populate('patientId','firstName lastName uhid').populate('admittingDoctorId','name specialty').populate('wardId','name code').populate('bedId','bedNo').sort({admittedAt:-1}).limit(Math.min(200,Number(req.query.limit)||100)).lean();
 res.json({success:true,data});
}));
router.post('/admissions',requirePermission('ipd.create'),requirePermission('bed.allocate'),allowRoles('hospital_admin','branch_admin','receptionist'),audit('admission.created','admission'),asyncHandler(async(req,res)=>{
 const {patientId,branchId,bedId}=req.body;const patient=await getPatient(req,patientId,branchId);if(!patient)return fail(res,'Patient not found in the permitted branch',404);
 const branch=branchId||patient.branchId;if(String(patient.branchId)!==String(branch)||!branchAllowed(req,branch))return fail(res,'Patient branch mismatch or access denied',403);
 if(!bedId)return fail(res,'Select a bed before confirming admission');
 const result=await transaction(async session=>{
  const bed=await HospitalBed.findOneAndUpdate({_id:bedId,tenantId:req.tenantId,branchId:branch,status:'available',currentAdmissionId:{$exists:false}},{$set:{status:'occupied',currentPatientId:patient._id}},{new:true,session});
  if(!bed)throw Object.assign(new Error('Bed is no longer available'),{statusCode:409});
  const ward=await Ward.findOne({_id:bed.wardId,tenantId:req.tenantId,active:true}).session(session);
  const room=await HospitalRoom.findOne({_id:bed.roomId,tenantId:req.tenantId,status:'active'}).session(session);
  if(!ward||!room)throw Object.assign(new Error('Ward or room is not active'),{statusCode:409});
  if(ward.genderRestriction!=='any'&&patient.sex!==ward.genderRestriction)throw Object.assign(new Error('Patient does not meet ward gender restriction'),{statusCode:409});
  const admissionNo=await nextNo(req.tenantId,'IPD',session);
  const admission=(await Admission.create([{tenantId:req.tenantId,branchId:branch,patientId,admissionNo,admittingDoctorId:req.body.admittingDoctorId||undefined,referringDoctorId:req.body.referringDoctorId||undefined,departmentId:req.body.departmentId||undefined,admissionType:req.body.admissionType||'planned',admissionSource:clean(req.body.admissionSource,80),reason:clean(req.body.reason,2000),preliminaryDiagnosis:clean(req.body.preliminaryDiagnosis,2000),condition:clean(req.body.condition,500),ward:ward.name,wardId:ward._id,room:room.roomNo,roomId:room._id,bed:bed.bedNo,bedId:bed._id,attendant:req.body.attendant||{},emergencyContact:req.body.emergencyContact||{},insurance:req.body.insurance||{},admissionNotes:clean(req.body.admissionNotes,5000),createdBy:req.user._id}],{session}))[0];
  bed.currentAdmissionId=admission._id;bed.currentPatientId=patient._id;await bed.save({session});
  await BedAllocation.create([{tenantId:req.tenantId,branchId:branch,admissionId:admission._id,patientId:patient._id,bedId:bed._id,allocatedBy:req.user._id}],{session});
  await writeActivity({tenantId:req.tenantId,branchId:branch,admissionId:admission._id,type:'admitted',description:'Patient admitted and bed allocated',to:{bedId:bed._id,bedNo:bed.bedNo},userId:req.user._id},session);
  return admission;
 });
 res.status(201).json({success:true,data:result});
}));
router.post('/admissions/:id/cancel',requirePermission('ipd.cancel'),allowRoles('hospital_admin','branch_admin'),audit('admission.cancelled','admission'),asyncHandler(async(req,res)=>{
 const reason=clean(req.body.reason,1000);if(!reason)return fail(res,'Cancellation reason is required');
 const result=await transaction(async session=>{
  const a=await getAdmission(req,req.params.id,session);if(!a||a.status!=='admitted')throw Object.assign(new Error('Active admission not found'),{statusCode:404});
  const bed=await HospitalBed.findOne({_id:a.bedId,tenantId:req.tenantId,currentAdmissionId:a._id}).session(session);
  if(bed){bed.currentAdmissionId=undefined;bed.currentPatientId=undefined;bed.status='cleaning';bed.updatedBy=req.user._id;await bed.save({session});}
  await BedAllocation.updateOne({tenantId:req.tenantId,admissionId:a._id,releasedAt:null},{$set:{releasedAt:new Date(),releaseReason:reason}},{session});
  a.status='cancelled';a.cancelledAt=new Date();a.cancelledBy=req.user._id;a.cancellationReason=reason;await a.save({session});
  await writeActivity({tenantId:req.tenantId,branchId:a.branchId,admissionId:a._id,type:'cancelled',description:'Admission cancelled; allocated bed moved to cleaning',reason,userId:req.user._id},session);return a;
 });res.json({success:true,data:result});
}));
router.get('/admissions/:id',requirePermission('admissions.view'),asyncHandler(async(req,res)=>{
 const admission=await Admission.findOne({_id:req.params.id,tenantId:req.tenantId,...branchScope(req)}).populate('patientId','firstName lastName uhid dob sex phone').populate('admittingDoctorId','name specialty').populate('wardId').populate('roomId').populate('bedId').lean();
 if(!admission)return fail(res,'Admission not found',404);
 const [activity,allocations,notes,carePlans,rounds,charges,discharge]=await Promise.all([
 AdmissionActivity.find({tenantId:req.tenantId,admissionId:admission._id}).sort({occurredAt:-1}).lean(),
 BedAllocation.find({tenantId:req.tenantId,admissionId:admission._id}).populate('bedId','bedNo').sort({allocatedAt:-1}).lean(),
 NursingNote.find({tenantId:req.tenantId,admissionId:admission._id}).sort({createdAt:-1}).lean(),
 CarePlan.find({tenantId:req.tenantId,admissionId:admission._id}).sort({createdAt:-1}).lean(),
 DoctorRound.find({tenantId:req.tenantId,admissionId:admission._id}).sort({createdAt:-1}).lean(),
 AdmissionCharge.find({tenantId:req.tenantId,admissionId:admission._id}).sort({serviceDate:-1}).lean(),
 DischargeRecord.findOne({tenantId:req.tenantId,admissionId:admission._id}).sort({createdAt:-1}).lean()
 ]);
 res.json({success:true,data:{admission,activity,allocations,notes,carePlans,rounds,charges,discharge}});
}));
router.post('/admissions/:id/transfer-bed',requirePermission('bed.transfer'),audit('bed.transferred','admission'),asyncHandler(async(req,res)=>{
 const reason=clean(req.body.reason,1000);if(!reason)return fail(res,'Transfer reason is required');
 const transfer=await transaction(async session=>{
  const admission=await getAdmission(req,req.params.id,session);if(!admission||admission.status!=='admitted')throw Object.assign(new Error('Active admission not found'),{statusCode:404});
  const oldBed=await HospitalBed.findOne({_id:admission.bedId,tenantId:req.tenantId,branchId:admission.branchId,currentAdmissionId:admission._id,status:'occupied'}).session(session);
  const newBed=await HospitalBed.findOneAndUpdate({_id:req.body.toBedId,tenantId:req.tenantId,branchId:admission.branchId,status:'available',currentAdmissionId:{$exists:false}},{$set:{status:'occupied',currentAdmissionId:admission._id,currentPatientId:admission.patientId,updatedBy:req.user._id}},{new:true,session});
  if(!oldBed||!newBed)throw Object.assign(new Error('Source bed invalid or destination bed unavailable'),{statusCode:409});
  const destinationWard=await Ward.findOne({_id:newBed.wardId,tenantId:req.tenantId,active:true}).session(session);const transferPatient=await Patient.findOne({_id:admission.patientId,tenantId:req.tenantId}).session(session);if(!destinationWard||!transferPatient||(destinationWard.genderRestriction!=='any'&&destinationWard.genderRestriction!==transferPatient.sex))throw Object.assign(new Error('Destination ward restriction does not allow this patient'),{statusCode:409});
  oldBed.currentAdmissionId=undefined;oldBed.currentPatientId=undefined;oldBed.status='cleaning';oldBed.updatedBy=req.user._id;await oldBed.save({session});
  await BedAllocation.updateOne({tenantId:req.tenantId,admissionId:admission._id,bedId:oldBed._id,releasedAt:null},{$set:{releasedAt:new Date(),releaseReason:reason}},{session});
  await BedAllocation.create([{tenantId:req.tenantId,branchId:admission.branchId,admissionId:admission._id,patientId:admission.patientId,bedId:newBed._id,allocatedBy:req.user._id}],{session});
  const transfer=(await BedTransfer.create([{tenantId:req.tenantId,branchId:admission.branchId,admissionId:admission._id,fromBedId:oldBed._id,toBedId:newBed._id,reason,handoverNotes:clean(req.body.handoverNotes,3000),requestedBy:req.user._id,approvedBy:req.user._id}],{session}))[0];
  const old={bedId:oldBed._id,bedNo:oldBed.bedNo},next={bedId:newBed._id,bedNo:newBed.bedNo};
  admission.bedId=newBed._id;admission.bed=newBed.bedNo;admission.roomId=newBed.roomId;admission.wardId=newBed.wardId;const ward=await Ward.findById(newBed.wardId).session(session),room=await HospitalRoom.findById(newBed.roomId).session(session);admission.ward=ward?.name;admission.room=room?.roomNo;await admission.save({session});
  await writeActivity({tenantId:req.tenantId,branchId:admission.branchId,admissionId:admission._id,type:'bed_transfer',description:'Patient bed transferred',from:old,to:next,reason,userId:req.user._id},session);
  return transfer;
 });res.status(201).json({success:true,data:transfer});
}));
router.post('/hospital-beds/:id/cleaning-complete',requirePermission('bed.manage'),audit('bed.cleaning_completed','hospital_bed'),asyncHandler(async(req,res)=>{
 const bed=await HospitalBed.findOne({_id:req.params.id,tenantId:req.tenantId,...branchScope(req),status:'cleaning',currentAdmissionId:{$exists:false}});if(!bed)return fail(res,'Bed is not awaiting cleaning completion',409);
 bed.status='available';bed.updatedBy=req.user._id;await bed.save();res.json({success:true,data:bed});
}));
router.get('/nursing/station',requirePermission('nursing.view'),asyncHandler(async(req,res)=>{
 const f={tenantId:req.tenantId,status:{$in:['admitted','discharge_requested']},...branchScope(req)};if(req.query.wardId)f.wardId=req.query.wardId;
 const data=await Admission.find(f).populate('patientId','firstName lastName uhid dob sex').populate('bedId','bedNo').populate('wardId','name').populate('admittingDoctorId','name').sort({admittedAt:1}).lean();
 res.json({success:true,data});
}));
router.post('/admissions/:id/nursing-notes',requirePermission('nursing.notes.create'),allowRoles('hospital_admin','branch_admin','nurse'),audit('nursing.note.created','nursing_note'),asyncHandler(async(req,res)=>{
 const a=await getAdmission(req,req.params.id);if(!a||!['admitted','discharge_requested'].includes(a.status))return fail(res,'Active admission not found',404);
 const body=clean(req.body.body,10000);if(!body)return fail(res,'Note content is required');
 const x=await NursingNote.create({tenantId:req.tenantId,branchId:a.branchId,admissionId:a._id,patientId:a.patientId,kind:req.body.kind||'observation',body,status:'draft',author:req.user._id});res.status(201).json({success:true,data:x});
}));
router.patch('/nursing-notes/:id/finalize',requirePermission('nursing.notes.finalize'),audit('nursing.note.finalized','nursing_note'),asyncHandler(async(req,res)=>{
 const x=await NursingNote.findOne({_id:req.params.id,tenantId:req.tenantId,...branchScope(req),status:'draft'});if(!x)return fail(res,'Draft note not found',404);
 x.status='finalized';x.finalizedAt=new Date();await x.save();res.json({success:true,data:x});
}));
router.post('/nursing-notes/:id/amend',requirePermission('nursing.notes.finalize'),audit('nursing.note.amended','nursing_note'),asyncHandler(async(req,res)=>{
 const x=await NursingNote.findOne({_id:req.params.id,tenantId:req.tenantId,...branchScope(req),status:'finalized'});const reason=clean(req.body.reason,1000),body=clean(req.body.body,10000);
 if(!x||!reason||!body)return fail(res,'Finalized note, amendment reason and replacement body are required');
 x.amendments.push({reason,body:x.body,author:req.user._id,amendedAt:new Date()});x.body=body;x.status='amended';await x.save();res.json({success:true,data:x});
}));
router.post('/admissions/:id/care-plans',requirePermission('nursing.notes.create'),audit('care_plan.created','care_plan'),asyncHandler(async(req,res)=>{
 const a=await getAdmission(req,req.params.id);if(!a||a.status!=='admitted')return fail(res,'Active admission not found',404);
 const title=clean(req.body.title,160);if(!title)return fail(res,'Care plan title is required');
 const x=await CarePlan.create({tenantId:req.tenantId,branchId:a.branchId,admissionId:a._id,patientId:a.patientId,title,problem:clean(req.body.problem,2000),goals:(req.body.goals||[]).map(v=>clean(v,500)).slice(0,20),interventions:(req.body.interventions||[]).map(v=>clean(v,500)).slice(0,30),responsibleNurse:req.body.responsibleNurse||undefined,reviewAt:req.body.reviewAt||undefined,createdBy:req.user._id});res.status(201).json({success:true,data:x});
}));
router.get('/admissions/:id/mar',requirePermission('medication.mar.view'),asyncHandler(async(req,res)=>{
 const a=await getAdmission(req,req.params.id);if(!a)return fail(res,'Admission not found',404);
 const prescriptions=await Prescription.find({tenantId:req.tenantId,patientId:a.patientId,branchId:a.branchId,status:{$in:['finalized','partially_dispensed','dispensed','amended']}}).sort({finalizedAt:-1}).lean();
 const administrations=await MedicationAdministration.find({tenantId:req.tenantId,admissionId:a._id}).populate('administeredBy','name').sort({scheduledAt:-1}).lean();
 res.json({success:true,data:{prescriptions,administrations}});
}));
router.post('/admissions/:id/mar',requirePermission('medication.mar.administer'),allowRoles('hospital_admin','branch_admin','nurse'),audit('medication.mar.recorded','medication_administration'),asyncHandler(async(req,res)=>{
 const a=await getAdmission(req,req.params.id);if(!a||a.status!=='admitted')return fail(res,'Active admission not found',404);
 const key=idempotency(req);if(!key)return fail(res,'Idempotency-Key is required');
 const prescription=await Prescription.findOne({_id:req.body.prescriptionId,tenantId:req.tenantId,patientId:a.patientId,branchId:a.branchId,status:{$in:['finalized','partially_dispensed','dispensed','amended']}});
 if(!prescription)return fail(res,'Valid finalized prescription not found',409);
 const itemIndex=Number(req.body.prescriptionItemIndex);if(!Number.isInteger(itemIndex)||!prescription.items[itemIndex])return fail(res,'Prescription item not found');
 const item=prescription.items[itemIndex];if(prescription.status==='cancelled')return fail(res,'Cancelled prescription cannot be administered',409);
 const status=req.body.status;if(!['administered','missed','refused','held','cancelled'].includes(status))return fail(res,'Invalid administration status');
 if(status!=='administered'&&!clean(req.body.reason,1000))return fail(res,'Reason is required for missed, refused, held or cancelled doses');
 const existing=await MedicationAdministration.findOne({tenantId:req.tenantId,idempotencyKey:key});if(existing)return res.json({success:true,data:existing,replayed:true});
 const x=await MedicationAdministration.create({tenantId:req.tenantId,branchId:a.branchId,admissionId:a._id,patientId:a.patientId,prescriptionId:prescription._id,prescriptionItemIndex:itemIndex,scheduledAt:req.body.scheduledAt||new Date(),status,administeredAt:status==='administered'?new Date(req.body.administeredAt||Date.now()):undefined,administeredBy:req.user._id,response:clean(req.body.response,1000),reason:clean(req.body.reason,1000),dispensingId:req.body.dispensingId||undefined,idempotencyKey:key});
 res.status(201).json({success:true,data:{...x.toObject(),medicine:item.medicine,dosage:item.dosage,route:item.route}});
}));
router.get('/admissions/:id/rounds',requirePermission('doctor.rounds.view'),asyncHandler(async(req,res)=>{
 const a=await getAdmission(req,req.params.id);if(!a)return fail(res,'Admission not found',404);
 const f={tenantId:req.tenantId,admissionId:a._id};if(req.user.role==='doctor'){const d=await Doctor.findOne({tenantId:req.tenantId,userId:req.user._id}).select('_id');if(!d)return fail(res,'Doctor profile not found',403);f.doctorId=d._id;}
 res.json({success:true,data:await DoctorRound.find(f).populate('doctorId','name specialty').sort({createdAt:-1}).lean()});
}));
router.post('/admissions/:id/rounds',requirePermission('doctor.rounds.manage'),allowRoles('hospital_admin','doctor'),audit('doctor.round.created','doctor_round'),asyncHandler(async(req,res)=>{
 const a=await getAdmission(req,req.params.id);if(!a||a.status!=='admitted')return fail(res,'Active admission not found',404);
 let doctor;if(req.user.role==='doctor')doctor=await Doctor.findOne({tenantId:req.tenantId,userId:req.user._id,branchIds:a.branchId});else doctor=await Doctor.findOne({_id:req.body.doctorId,tenantId:req.tenantId,branchIds:a.branchId});
 if(!doctor)return fail(res,'Doctor not found in admission branch',404);
 const note=clean(req.body.progressNote,10000);if(!note)return fail(res,'Progress note is required');
 const x=await DoctorRound.create({tenantId:req.tenantId,branchId:a.branchId,admissionId:a._id,patientId:a.patientId,doctorId:doctor._id,condition:clean(req.body.condition,500),progressNote:note,diagnosisUpdates:(req.body.diagnosisUpdates||[]).map(v=>clean(v,500)).slice(0,20),treatmentPlan:clean(req.body.treatmentPlan,5000),instructions:clean(req.body.instructions,3000),followUpAt:req.body.followUpAt,dischargePlanning:clean(req.body.dischargePlanning,2000),createdBy:req.user._id});
 res.status(201).json({success:true,data:x});
}));
router.post('/admissions/:id/icu-observations',requirePermission('icu.manage'),allowRoles('hospital_admin','branch_admin','doctor','nurse'),audit('icu.observation.created','icu_observation'),asyncHandler(async(req,res)=>{
 const a=await getAdmission(req,req.params.id);if(!a||a.status!=='admitted')return fail(res,'Active admission not found',404);
 const values=req.body.values;if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>40)return fail(res,'Observation values must be a bounded object');
 const x=await IcuObservation.create({tenantId:req.tenantId,branchId:a.branchId,admissionId:a._id,patientId:a.patientId,values,notes:clean(req.body.notes,2000),recordedBy:req.user._id});res.status(201).json({success:true,data:x});
}));
router.get('/icu/dashboard',requirePermission('icu.view'),asyncHandler(async(req,res)=>{
 const wards=await Ward.find({tenantId:req.tenantId,...branchScope(req),type:{$in:['icu','nicu','picu']},active:true}).select('_id name code').lean();
 const ids=wards.map(x=>x._id);
 const [patients,observations]=await Promise.all([
 Admission.find({tenantId:req.tenantId,...branchScope(req),status:'admitted',wardId:{$in:ids}}).populate('patientId','firstName lastName uhid').populate('bedId','bedNo').populate('wardId','name').sort({admittedAt:1}).lean(),
 IcuObservation.find({tenantId:req.tenantId,...branchScope(req)}).sort({recordedAt:-1}).limit(100).lean()
 ]);
 res.json({success:true,data:{wards,patients,latestObservations:observations}});
}));
router.get('/ot/rooms',requirePermission('ot.view'),asyncHandler(async(req,res)=>res.json({success:true,data:await OTRoom.find({tenantId:req.tenantId,...branchScope(req)}).lean()})));
router.post('/ot/rooms',requirePermission('ot.manage'),audit('ot.room.created','ot_room'),asyncHandler(async(req,res)=>{
 const {branchId,name,code}=req.body;if(!branchId||!branchAllowed(req,branchId)||!clean(name)||!clean(code))return fail(res,'Branch, room name and code are required');
 const x=await OTRoom.create({tenantId:req.tenantId,branchId,name:clean(name,100),code:clean(code,40).toUpperCase(),equipment:(req.body.equipment||[]).map(v=>clean(v,100)).slice(0,40)});res.status(201).json({success:true,data:x});
}));
router.get('/ot/surgeries',requirePermission('ot.view'),asyncHandler(async(req,res)=>res.json({success:true,data:await SurgeryCatalogue.find({tenantId:req.tenantId}).sort({name:1}).lean()})));
router.post('/ot/surgeries',requirePermission('ot.manage'),audit('surgery.catalogue.created','surgery'),asyncHandler(async(req,res)=>{
 const {code,name}=req.body;if(!clean(code)||!clean(name))return fail(res,'Surgery code and name are required');
 const x=await SurgeryCatalogue.create({tenantId:req.tenantId,code:clean(code,40).toUpperCase(),name:clean(name,160),description:clean(req.body.description,2000),standardDurationMinutes:Math.max(5,Number(req.body.standardDurationMinutes)||60),standardPrice:Math.max(0,Number(req.body.standardPrice)||0)});res.status(201).json({success:true,data:x});
}));
router.get('/ot/bookings',requirePermission('ot.view'),asyncHandler(async(req,res)=>{
 const f={tenantId:req.tenantId,...branchScope(req)};if(req.query.from||req.query.to)f.startAt={...(req.query.from?{$gte:new Date(req.query.from)}:{}),...(req.query.to?{$lte:new Date(req.query.to)}:{})};
 res.json({success:true,data:await SurgeryBooking.find(f).populate('patientId','firstName lastName uhid').populate('surgeryId','name code').populate('otRoomId','name code').sort({startAt:1}).limit(300).lean()});
}));
router.post('/ot/bookings',requirePermission('surgery.schedule'),audit('surgery.scheduled','surgery_booking'),asyncHandler(async(req,res)=>{
 const {admissionId,otRoomId,surgeryId,startAt,endAt}=req.body;const start=new Date(startAt),end=new Date(endAt);
 if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)return fail(res,'Valid surgery start and end times are required');
 const a=await getAdmission(req,admissionId);if(!a||a.status!=='admitted')return fail(res,'Active admission not found',404);
 const room=await OTRoom.findOne({_id:otRoomId,tenantId:req.tenantId,branchId:a.branchId,active:true});if(!room)return fail(res,'OT room not found in branch',404);
 const surgery=await SurgeryCatalogue.findOne({_id:surgeryId,tenantId:req.tenantId,active:true});if(!surgery)return fail(res,'Surgery catalogue item not found',404);
 const booking=await transaction(async session=>{
  const conflict=await SurgeryBooking.findOne({tenantId:req.tenantId,otRoomId,startAt:{$lt:end},endAt:{$gt:start},status:{$nin:['cancelled','completed']}}).session(session);
  if(conflict)throw Object.assign(new Error('OT room is already booked for this time'),{statusCode:409});
  const bookingId=new mongoose.Types.ObjectId(),slots=[];for(let t=Math.floor(+start/300000)*300000;t<+end;t+=300000)slots.push({tenantId:req.tenantId,otRoomId,slotStart:new Date(t),bookingId});
  await OTSlotLock.insertMany(slots,{session});
  return (await SurgeryBooking.create([{_id:bookingId,tenantId:req.tenantId,branchId:a.branchId,admissionId:a._id,patientId:a.patientId,surgeryId,otRoomId,startAt:start,endAt:end,surgeonId:req.body.surgeonId||undefined,assistantSurgeonId:req.body.assistantSurgeonId||undefined,anesthetistId:req.body.anesthetistId||undefined,nursingTeam:req.body.nursingTeam||[],status:'scheduled',createdBy:req.user._id}],{session}))[0];
 });
 res.status(201).json({success:true,data:booking});
}));
router.patch('/ot/bookings/:id/status',requirePermission('surgery.update'),audit('surgery.status_changed','surgery_booking'),asyncHandler(async(req,res)=>{
 const allowed=['confirmed','in_progress','completed','cancelled'];if(!allowed.includes(req.body.status))return fail(res,'Invalid surgery status');
 const x=await SurgeryBooking.findOne({_id:req.params.id,tenantId:req.tenantId,...branchScope(req)});if(!x)return fail(res,'Surgery booking not found',404);
 const transitions={scheduled:['confirmed','cancelled'],confirmed:['in_progress','cancelled'],in_progress:['completed']};if(!transitions[x.status]?.includes(req.body.status))return fail(res,'Invalid surgery status transition',409);if(req.body.status==='in_progress'&&(!x.preOp?.checklist||Object.values(x.preOp.checklist).some(v=>v!==true)))return fail(res,'Complete every pre-operative checklist item before starting surgery',409);if(req.body.status==='completed'&&!x.postOp?.procedureSummary)return fail(res,'Record the post-operative summary before completing surgery',409);
 x.status=req.body.status;await x.save();if(['completed','cancelled'].includes(x.status))await OTSlotLock.deleteMany({tenantId:req.tenantId,bookingId:x._id});res.json({success:true,data:x});
}));
router.patch('/ot/bookings/:id/preop',requirePermission('ot.manage'),allowRoles('hospital_admin','branch_admin','doctor','nurse'),audit('surgery.preop.updated','surgery_booking'),asyncHandler(async(req,res)=>{
 const x=await SurgeryBooking.findOne({_id:req.params.id,tenantId:req.tenantId,...branchScope(req),status:{$in:['scheduled','confirmed']}});if(!x)return fail(res,'Scheduled surgery not found',404);
 const checklist=req.body.checklist;if(!checklist||typeof checklist!=='object'||Array.isArray(checklist))return fail(res,'Pre-operative checklist object is required');
 const allowed=['identityVerified','consentDocumented','procedureConfirmed','allergiesReviewed','medicationReviewed','investigationsReviewed','preparationComplete'];
 const safe={};for(const k of allowed)safe[k]=checklist[k]===true;
 x.preOp={checklist:safe,notes:clean(req.body.notes,3000),completedBy:req.user._id,completedAt:new Date()};await x.save();res.json({success:true,data:x});
}));
router.patch('/ot/bookings/:id/postop',requirePermission('ot.manage'),allowRoles('hospital_admin','branch_admin','doctor','nurse'),audit('surgery.postop.updated','surgery_booking'),asyncHandler(async(req,res)=>{
 const x=await SurgeryBooking.findOne({_id:req.params.id,tenantId:req.tenantId,...branchScope(req),status:'in_progress'});if(!x)return fail(res,'Surgery is not in progress',409);
 const summary=clean(req.body.procedureSummary,8000);if(!summary)return fail(res,'Procedure summary is required');
 x.postOp={procedureSummary:summary,surgeonNotes:clean(req.body.surgeonNotes,5000),anesthesiaNotes:clean(req.body.anesthesiaNotes,5000),recoveryObservations:clean(req.body.recoveryObservations,5000),complications:clean(req.body.complications,3000),instructions:clean(req.body.instructions,3000),recordedBy:req.user._id,recordedAt:new Date()};await x.save();res.json({success:true,data:x});
}));
router.post('/admissions/:id/discharge-request',requirePermission('discharge.create'),allowRoles('hospital_admin','branch_admin','doctor'),audit('discharge.requested','discharge'),asyncHandler(async(req,res)=>{
 const a=await getAdmission(req,req.params.id);if(!a||a.status!=='admitted')return fail(res,'Active admission not found',404);
 const x=await transaction(async session=>{
  const existing=await DischargeRecord.findOne({tenantId:req.tenantId,admissionId:a._id}).session(session);if(existing)return existing;
  const current=await Admission.findOne({_id:a._id,tenantId:req.tenantId,status:'admitted'}).session(session);if(!current)throw Object.assign(new Error('Admission is no longer active'),{statusCode:409});
  const record=(await DischargeRecord.create([{tenantId:req.tenantId,branchId:a.branchId,admissionId:a._id,patientId:a.patientId,status:'requested',dischargeType:req.body.dischargeType||'routine',finalDiagnosis:clean(req.body.finalDiagnosis,3000),treatmentSummary:clean(req.body.treatmentSummary,8000),procedures:clean(req.body.procedures,4000),medicationSummary:clean(req.body.medicationSummary,4000),investigationSummary:clean(req.body.investigationSummary,4000),followUpInstructions:clean(req.body.followUpInstructions,4000),doctorAdvice:clean(req.body.doctorAdvice,3000),createdBy:req.user._id}],{session}))[0];
  current.status='discharge_requested';current.dischargeRequestedAt=new Date();await current.save({session});
  await AdmissionActivity.create([{tenantId:req.tenantId,branchId:a.branchId,admissionId:a._id,type:'discharge_requested',description:'Discharge workflow initiated',createdBy:req.user._id}],{session});return record;
 });res.status(201).json({success:true,data:x});
}));
router.patch('/discharges/:id/approve',requirePermission('discharge.approve'),allowRoles('hospital_admin','branch_admin','doctor'),audit('discharge.approved','discharge'),asyncHandler(async(req,res)=>{
 const x=await transaction(async session=>{
  const record=await DischargeRecord.findOne({_id:req.params.id,tenantId:req.tenantId,...branchScope(req),status:'requested'}).session(session);if(!record)throw Object.assign(new Error('Discharge request not found'),{statusCode:404});
  const a=await Admission.findOne({_id:record.admissionId,tenantId:req.tenantId,status:'discharge_requested'}).session(session);if(!a)throw Object.assign(new Error('Admission is not awaiting discharge'),{statusCode:409});
  record.status='approved';record.approvedBy=req.user._id;await record.save({session});a.dischargeApprovedAt=new Date();a.dischargeApprovedBy=req.user._id;await a.save({session});return record;
 });res.json({success:true,data:x});
}));
router.patch('/discharges/:id/nursing-clearance',requirePermission('discharge.approve'),allowRoles('hospital_admin','branch_admin','nurse'),audit('discharge.nursing_cleared','discharge'),asyncHandler(async(req,res)=>{
 const x=await DischargeRecord.findOne({_id:req.params.id,tenantId:req.tenantId,...branchScope(req),status:'approved'});if(!x)return fail(res,'Approved discharge not found',404);
 x.status='nursing_cleared';x.nursingClearedAt=new Date();await x.save();res.json({success:true,data:x});
}));
router.patch('/discharges/:id/finalize',requirePermission('discharge.finalize'),allowRoles('hospital_admin','branch_admin'),audit('discharge.finalized','discharge'),asyncHandler(async(req,res)=>{
 const result=await transaction(async session=>{
  const d=await DischargeRecord.findOne({_id:req.params.id,tenantId:req.tenantId,...branchScope(req),status:'nursing_cleared'}).session(session);
  if(!d)throw Object.assign(new Error('Nursing-cleared discharge not found'),{statusCode:409});
  const a=await Admission.findOne({_id:d.admissionId,tenantId:req.tenantId,status:'discharge_requested'}).session(session);
  if(!a)throw Object.assign(new Error('Admission is not awaiting discharge'),{statusCode:409});
  // Medical discharge is deliberately independent of invoice settlement.
  const bed=await HospitalBed.findOne({_id:a.bedId,tenantId:req.tenantId,currentAdmissionId:a._id,status:'occupied'}).session(session);
  if(bed){bed.currentAdmissionId=undefined;bed.currentPatientId=undefined;bed.status='cleaning';bed.updatedBy=req.user._id;await bed.save({session});}
  await BedAllocation.updateOne({tenantId:req.tenantId,admissionId:a._id,releasedAt:null},{$set:{releasedAt:new Date(),releaseReason:'Patient discharged'}},{session});
  a.status='discharged';a.dischargedAt=new Date();a.dischargeType=d.dischargeType;a.dischargeSummary=[d.finalDiagnosis,d.treatmentSummary,d.procedures,d.medicationSummary,d.investigationSummary,d.followUpInstructions,d.doctorAdvice].filter(Boolean).join('\
\
');a.dischargeFinalizedAt=new Date();a.dischargeFinalizedBy=req.user._id;await a.save({session});
  d.status='released';d.releasedAt=new Date();d.releasedBy=req.user._id;await d.save({session});
  await writeActivity({tenantId:req.tenantId,branchId:a.branchId,admissionId:a._id,type:'discharged',description:'Clinical discharge finalized; bed sent to cleaning',reason:d.dischargeType,userId:req.user._id},session);
  return {admission:a,discharge:d,bed};
 });
 res.json({success:true,data:result});
}));
router.get('/admissions/:id/billing-summary',requirePermission('ipd.billing.view'),asyncHandler(async(req,res)=>{
 const a=await getAdmission(req,req.params.id);if(!a)return fail(res,'Admission not found',404);
 const [charges,invoices]=await Promise.all([AdmissionCharge.find({tenantId:req.tenantId,admissionId:a._id}).sort({serviceDate:1}).lean(),Invoice.find({tenantId:req.tenantId,admissionId:a._id}).select('invoiceNo status total paid').sort({createdAt:-1}).lean()]);
 const total=charges.reduce((n,x)=>n+Number(x.amount||0),0);res.json({success:true,data:{charges,invoices,totalCharges:Math.round(total*100)/100,invoicedCharges:charges.filter(x=>x.invoiceId).reduce((n,x)=>n+Number(x.amount||0),0),unbilledCharges:charges.filter(x=>!x.invoiceId).reduce((n,x)=>n+Number(x.amount||0),0)}});
}));
router.post('/admissions/:id/charges',requirePermission('ipd.billing.manage'),audit('ipd.charge.created','admission_charge'),asyncHandler(async(req,res)=>{
 const a=await getAdmission(req,req.params.id);if(!a||!['admitted','discharge_requested'].includes(a.status))return fail(res,'Active admission not found',404);
 const key=idempotency(req);if(!key)return fail(res,'Idempotency-Key is required');
 const existing=await AdmissionCharge.findOne({tenantId:req.tenantId,idempotencyKey:key});if(existing)return res.json({success:true,data:existing,replayed:true});
 const service=await Service.findOne({_id:req.body.serviceId,tenantId:req.tenantId,active:true});if(!service)return fail(res,'Active billing service not found',404);
 const quantity=Number(req.body.quantity??1);if(!Number.isFinite(quantity)||quantity<=0||quantity>10000)return fail(res,'Invalid charge quantity');
 const branchPrice=service.branchPricing?.find(x=>String(x.branchId)===String(a.branchId))?.price;
 const unitPrice=Number(branchPrice??service.standardPrice);let subtotal=Math.round(quantity*unitPrice*100)/100,taxRate=0,taxType='none',taxAmount=0;
 if(service.taxConfigurationId){const tax=await TaxConfiguration.findOne({_id:service.taxConfigurationId,tenantId:req.tenantId,active:true,$or:[{branchId:a.branchId},{branchId:null}]});if(tax&&!tax.exempt){taxRate=Number(tax.rate||0);taxType=tax.taxType||'none';taxAmount=Math.round(subtotal*taxRate/100*100)/100;if(tax.inclusive){subtotal=Math.round((subtotal/(1+taxRate/100))*100)/100;taxAmount=Math.round((quantity*unitPrice-subtotal)*100)/100;}}}
 const amount=Math.round((subtotal+taxAmount)*100)/100;
 const charge=await AdmissionCharge.create({tenantId:req.tenantId,branchId:a.branchId,admissionId:a._id,patientId:a.patientId,serviceId:service._id,category:service.category,description:clean(req.body.description,300)||service.name,quantity,unitPrice,subtotal,taxAmount,taxRate,taxType,cgst:taxType==='cgst_sgst'?Math.round(taxAmount/2*100)/100:0,sgst:taxType==='cgst_sgst'?Math.round((taxAmount-Math.round(taxAmount/2*100)/100)*100)/100:0,igst:taxType==='igst'?taxAmount:0,amount,serviceDate:req.body.serviceDate?new Date(req.body.serviceDate):new Date(),sourceType:'ipd_service',sourceId:new mongoose.Types.ObjectId(),idempotencyKey:key,recordedBy:req.user._id});
 res.status(201).json({success:true,data:charge});
}));
router.post('/admissions/:id/billing-draft',requirePermission('ipd.billing.manage'),audit('ipd.invoice.draft_generated','invoice'),asyncHandler(async(req,res)=>{
 const result=await transaction(async session=>{
  const a=await getAdmission(req,req.params.id,session);if(!a)throw Object.assign(new Error('Admission not found'),{statusCode:404});
  let invoice=await Invoice.findOne({tenantId:req.tenantId,admissionId:a._id,status:'draft'}).session(session);
  const charges=await AdmissionCharge.find({tenantId:req.tenantId,admissionId:a._id,invoiceId:{$exists:false}}).session(session);
  if(!charges.length&&invoice)return invoice;
  if(!charges.length)throw Object.assign(new Error('No unbilled admission charges'),{statusCode:409});
  if(!invoice){const invoiceNo=await nextNo(req.tenantId,'IPD-INV',session);invoice=(await Invoice.create([{tenantId:req.tenantId,branchId:a.branchId,patientId:a.patientId,invoiceNo,admissionId:a._id,invoiceType:'ipd',status:'draft',subtotal:0,discount:0,tax:0,cgst:0,sgst:0,igst:0,total:0,paid:0,createdBy:req.user._id,items:[]}],{session}))[0];}
  if(invoice.status!=='draft')throw Object.assign(new Error('Existing IPD invoice is already finalized; use the billing adjustment workflow'),{statusCode:409});
  for(const c of charges){invoice.items.push({serviceId:c.serviceId,sourceType:'ipd_admission_charge',sourceId:c._id,description:c.description,category:c.category,quantity:c.quantity,unitPrice:c.unitPrice,taxRate:c.taxRate,taxType:c.taxType,taxAmount:c.taxAmount,amount:c.amount});invoice.subtotal+=c.subtotal;invoice.tax+=c.taxAmount;invoice.cgst+=c.cgst||0;invoice.sgst+=c.sgst||0;invoice.igst+=c.igst||0;invoice.total+=c.amount;await BillingSourceLink.create([{tenantId:req.tenantId,branchId:a.branchId,sourceType:'ipd_admission_charge',sourceId:c._id,patientId:a.patientId,invoiceId:invoice._id,createdBy:req.user._id}],{session});c.invoiceId=invoice._id;c.invoicedAt=new Date();await c.save({session});}
  await invoice.save({session});return invoice;
 });res.status(201).json({success:true,data:result});
}));
async function streamDischargePdf(res,record,admission,patient){
 const doc=new PDFDocument({size:'A4',margin:48});res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`inline; filename="${admission.admissionNo}-discharge-summary.pdf"`);doc.pipe(res);
 doc.fontSize(20).fillColor('#173F35').text('CareFlow — Discharge Summary');doc.moveDown();
 doc.fontSize(10).fillColor('#172B25').text(`Admission: ${admission.admissionNo}`).text(`Patient: ${patient.firstName} ${patient.lastName||''} · UHID: ${patient.uhid}`).text(`Admission date: ${admission.admittedAt?.toISOString?.()||''}`).text(`Discharge date: ${admission.dischargedAt?.toISOString?.()||''}`).text(`Discharge type: ${record.dischargeType||'—'}`);
 const sections=[['Final diagnosis',record.finalDiagnosis],['Treatment summary',record.treatmentSummary],['Procedures',record.procedures],['Medication summary',record.medicationSummary],['Investigation summary',record.investigationSummary],['Follow-up instructions',record.followUpInstructions],['Doctor advice',record.doctorAdvice]];
 for(const [title,body] of sections){if(body){doc.moveDown().fontSize(12).fillColor('#173F35').text(title);doc.moveDown(.3).fontSize(10).fillColor('#172B25').text(body,{width:490});}}
 doc.moveDown(2).fontSize(9).fillColor('#738078').text('This document is released by the hospital system. It is not a cryptographic digital signature.');doc.end();
}
router.get('/discharges/:id/pdf',requirePermission('discharge.view'),asyncHandler(async(req,res)=>{
 const d=await DischargeRecord.findOne({_id:req.params.id,tenantId:req.tenantId,...branchScope(req),status:'released'});if(!d)return fail(res,'Released discharge summary not found',404);
 const a=await Admission.findOne({_id:d.admissionId,tenantId:req.tenantId});const p=await Patient.findOne({_id:d.patientId,tenantId:req.tenantId});if(!a||!p)return fail(res,'Discharge record is incomplete',404);
 await streamDischargePdf(res,d,a,p);
}));
router.get('/patient-portal/my-admissions/:id/discharge.pdf',asyncHandler(async(req,res)=>{
 if(req.user.role!=='patient'||!req.user.patientId)return fail(res,'Patient account required',403);
 const a=await Admission.findOne({_id:req.params.id,tenantId:req.tenantId,patientId:req.user.patientId,status:'discharged'});if(!a)return fail(res,'Admission not found',404);
 const d=await DischargeRecord.findOne({tenantId:req.tenantId,admissionId:a._id,status:'released'});if(!d)return fail(res,'Released discharge summary not found',404);
 const p=await Patient.findOne({_id:req.user.patientId,tenantId:req.tenantId});await streamDischargePdf(res,d,a,p);
}));
router.get('/patient-portal/my-admissions',asyncHandler(async(req,res)=>{
 if(req.user.role!=='patient'||!req.user.patientId)return fail(res,'Patient account required',403);
 const data=await Admission.find({tenantId:req.tenantId,patientId:req.user.patientId,status:{$in:['admitted','discharge_requested','discharged']}}).select('admissionNo ward room bed admittedAt dischargedAt status dischargeSummary').sort({admittedAt:-1}).lean();
 res.json({success:true,data});
}));
module.exports=router;
