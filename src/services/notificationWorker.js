const {NotificationOutbox,Notification,NotificationPreference,User,Tenant,Employee,EmployeeDocument,PatientFollowUp,Appointment,LeaveRequest,AutomationRun,ShiftAssignment,Attendance,Holiday,LeavePolicy,LeaveAccrual,LeaveBalance}=require('../models');
const {sendMail,isConfigured}=require('./email');
const {Types}=require('mongoose');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function deliverOne(){
 const now=new Date();const item=await NotificationOutbox.findOneAndUpdate({status:{$in:['pending','failed','partial','processing']},attempts:{$lt:8},nextAttemptAt:{$lte:now},$or:[{lockedAt:null},{lockedAt:{$lt:new Date(now.getTime()-120000)}}]},{$set:{status:'processing',lockedAt:now},$inc:{attempts:1}},{new:true,sort:{createdAt:1}});
 if(!item)return false;
 const user=item.userId?await User.findOne({_id:item.userId,tenantId:item.tenantId,active:true}).select('email name patientId'):null;
 const pref=item.userId?await NotificationPreference.findOne({tenantId:item.tenantId,userId:item.userId}):null;const patient=user?.patientId?await require('../models').Patient.findOne({_id:user.patientId,tenantId:item.tenantId}).select('communicationPreferences'):null;
 const channels=item.channels||['inApp'];const delivered=new Set(item.deliveredChannels||[]);const errors=[];
 for(const channel of channels){
  if(delivered.has(channel))continue;if(pref?.categories&&pref.categories[item.category]===false){delivered.add(channel);continue;}if(patient&&item.category==='appointment'&&(patient.communicationPreferences?.appointmentReminders===false||(channel==='email'&&patient.communicationPreferences?.email===false)||(channel==='sms'&&patient.communicationPreferences?.sms===false)||(channel==='whatsapp'&&patient.communicationPreferences?.whatsapp===false))){delivered.add(channel);continue;}
  if(channel==='inApp'){
   if(!item.userId){errors.push('inApp requires a recipient user');continue;}
   if(pref?.channels?.inApp===false){delivered.add(channel);continue;}
   try{await Notification.updateOne({tenantId:item.tenantId,idempotencyKey:`outbox:${item._id}:inApp`},{$setOnInsert:{tenantId:item.tenantId,branchId:item.branchId,userId:item.userId,category:['hrm','attendance','leave','payroll','crm','complaint','recruitment'].includes(item.category)?item.category:'system',title:item.title,message:item.message,link:item.payload?.link,idempotencyKey:`outbox:${item._id}:inApp`}},{upsert:true});delivered.add(channel);}catch(e){errors.push(`inApp: ${e.message}`)}
  }else if(channel==='email'){
   if(pref?.channels?.email===false){delivered.add(channel);continue;}
   if(!user?.email){errors.push('email recipient unavailable');continue;}
   if(!isConfigured()){errors.push('SMTP not configured');continue;}
   try{const result=await sendMail({to:user.email,subject:item.title,text:item.message});if(result.sent)delivered.add(channel);else errors.push(result.reason||'email provider did not accept message')}catch(e){errors.push(`email: ${e.message}`)}
  }else if(channel==='sms'||channel==='whatsapp'){
   if(pref?.channels?.[channel]===false){delivered.add(channel);continue;}
   errors.push(`${channel} provider adapter is not configured`);
  }else errors.push(`Unsupported channel: ${channel}`);
  item.deliveredChannels=[...delivered];await item.save();
 }
 item.deliveredChannels=[...delivered];item.lockedAt=undefined;item.lastError=errors.join('; ').slice(0,1500);
 if(errors.length===0)item.status='sent';
 else if(delivered.size)item.status='partial';
 else item.status='failed';
 if(errors.length)item.nextAttemptAt=new Date(Date.now()+Math.min(3600000,Math.pow(2,Math.min(item.attempts,10))*15000));
 await item.save();return true;
}
async function runOutboxBatch(limit=20){for(let i=0;i<limit;i++){const did=await deliverOne();if(!did)break;}}
async function queueForUser(tenantId,userId,category,title,message,key,branchId){
 await NotificationOutbox.updateOne({tenantId,idempotencyKey:key},{$setOnInsert:{tenantId,userId,branchId,category,title,message,channels:['inApp'],idempotencyKey:key,status:'pending',nextAttemptAt:new Date()}},{upsert:true});
}
async function runTenantDaily(tenant){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let checkpoint;try{checkpoint=await AutomationRun.create({tenantId:tenant._id,jobKey:'daily-reminders',runDate:today,status:'processing',lockedUntil:new Date(Date.now()+10*60000)});}catch{
  checkpoint=await AutomationRun.findOne({tenantId:tenant._id,jobKey:'daily-reminders',runDate:today});
  if(!checkpoint||checkpoint.status==='completed'||(checkpoint.lockedUntil&&checkpoint.lockedUntil>Date.now()))return;
  checkpoint.status='processing';checkpoint.lockedUntil=new Date(Date.now()+10*60000);checkpoint.attempts++;await checkpoint.save();
 }
 try{
  const tomorrow=new Date(`${today}T12:00:00.000Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);const nextKey=tomorrow.toISOString().slice(0,10),dayAfter=new Date(`${nextKey}T12:00:00.000Z`);dayAfter.setUTCDate(dayAfter.getUTCDate()+1);const next=zonedDate(nextKey,'00:00','Asia/Kolkata'),end=zonedDate(dayAfter.toISOString().slice(0,10),'00:00','Asia/Kolkata');
  const birthdays=await Employee.find({tenantId:tenant._id,status:'active',userId:{$exists:true},dob:{$exists:true}}).select('userId firstName dob branchId').lean();
  for(const e of birthdays){const d=new Date(e.dob);if(`${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`===nextKey.slice(5))await queueForUser(tenant._id,e.userId,'hrm','Upcoming birthday',`Your birthday is tomorrow. Best wishes from your organization.`,`birthday:${e._id}:${nextKey}`,e.branchId);}
  const expiring=await EmployeeDocument.find({tenantId:tenant._id,expiresAt:{$gte:new Date(),$lte:new Date(Date.now()+30*86400000)},deletedAt:null}).populate('employeeId','userId firstName lastName').lean();
  for(const d of expiring){if(d.employeeId?.userId)await queueForUser(tenant._id,d.employeeId.userId,'hrm','Employee document expiring',`${d.category} document expires on ${d.expiresAt.toISOString().slice(0,10)}.`,`document-expiry:${d._id}`,d.branchId);}
  const followups=await PatientFollowUp.find({tenantId:tenant._id,status:'pending',dueAt:{$gte:next,$lt:end},assignedTo:{$exists:true}}).select('assignedTo patientId dueAt').lean();
  for(const f of followups)await queueForUser(tenant._id,f.assignedTo,'crm','Patient follow-up due tomorrow','A patient follow-up task is due tomorrow. Open the CRM follow-up worklist.',`followup:${f._id}:${nextKey}`,f.branchId);
  const appointments=await Appointment.find({tenantId:tenant._id,startAt:{$gte:next,$lt:end}}).select('patientId branchId').lean();
  const patientUsers=await User.find({tenantId:tenant._id,role:'patient',active:true,patientId:{$in:appointments.map(a=>a.patientId)}}).select('_id patientId').lean();
  for(const a of appointments){const u=patientUsers.find(x=>String(x.patientId)===String(a.patientId));if(u)await queueForUser(tenant._id,u._id,'appointment','Appointment reminder','You have an appointment scheduled for tomorrow. Please check your patient portal for details.',`appointment-reminder:${a._id}:${nextKey}`,a.branchId);}
  const pending=await LeaveRequest.find({tenantId:tenant._id,status:{$in:['pending','level1_approved']}}).select('branchId').lean();
  if(pending.length){const admins=await User.find({tenantId:tenant._id,role:{$in:['hospital_admin','branch_admin']},active:true}).select('_id role branchIds').lean();for(const a of admins){const count=a.role==='branch_admin'?pending.filter(p=>p.branchId&&a.branchIds.some(b=>String(b)===String(p.branchId))).length:pending.length;if(!count)continue;await queueForUser(tenant._id,a._id,'leave','Leave requests awaiting review',`${count} leave request(s) are awaiting approval.`,`leave-pending:${a._id}:${today}`);}}
  checkpoint.status='completed';checkpoint.completedAt=new Date();checkpoint.lockedUntil=undefined;await checkpoint.save();
 }catch(e){checkpoint.status='failed';checkpoint.lastError=e.message;checkpoint.lockedUntil=undefined;await checkpoint.save();throw e;}
}

function zonedDate(key,time,tz){const [y,m,d]=key.split('-').map(Number),[hh,mm]=time.split(':').map(Number);let guess=Date.UTC(y,m-1,d,hh,mm);for(let i=0;i<3;i++){const p=new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));const v=Object.fromEntries(p.map(x=>[x.type,x.value]));guess+=Date.UTC(y,m-1,d,hh,mm)-Date.UTC(+v.year,+v.month-1,+v.day,+v.hour,+v.minute);}return new Date(guess);}
function localKey(date,tz){const p=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),v=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${v.year}-${v.month}-${v.day}`;}
async function markAbsences(){
 const now=new Date(),assignments=await ShiftAssignment.find({status:'active',effectiveFrom:{$lte:now},$or:[{effectiveTo:null},{effectiveTo:{$gte:now}}]}).populate('employeeId').populate('shiftId').lean();
 for(const a of assignments){const e=a.employeeId,s=a.shiftId;if(!e||e.status!=='active'||!s?.active)continue;const tz=s.timezone||'Asia/Kolkata';let key=localKey(now,tz);const overnight=s.endTime<=s.startTime,clock=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);if(overnight&&clock<s.startTime){const d=new Date(`${key}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);key=d.toISOString().slice(0,10);}
  const weekday=new Date(`${key}T12:00:00Z`).getUTCDay();if(!(a.weekdays||[0,1,2,3,4,5,6]).includes(weekday)||(s.weeklyOffs||[]).includes(weekday))continue;
  const workDate=new Date(`${key}T00:00:00.000Z`);if(a.effectiveFrom>workDate||(a.effectiveTo&&a.effectiveTo<workDate))continue;const winning=await ShiftAssignment.findOne({tenantId:a.tenantId,employeeId:e._id,status:'active',effectiveFrom:{$lte:workDate},$or:[{effectiveTo:null},{effectiveTo:{$gte:workDate}}]}).sort({effectiveFrom:-1,createdAt:-1}).lean();if(!winning||String(winning._id)!==String(a._id))continue;const holiday=await Holiday.exists({tenantId:a.tenantId,date:workDate,active:true,$or:[{branchId:e.branchId},{branchId:null}]});if(holiday)continue;
  const endKey=overnight?(()=>{const d=new Date(`${key}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)})():key;
  const shiftEnd=zonedDate(endKey,s.endTime,tz);if(now<new Date(+shiftEnd+(Number(s.graceMinutes)||0)*60000))continue;
  await Attendance.updateOne({tenantId:a.tenantId,employeeId:e._id,workDate,shiftId:s._id},{$setOnInsert:{tenantId:a.tenantId,branchId:e.branchId,employeeId:e._id,shiftId:s._id,workDate,status:'absent',source:'system',remarks:'Automatically marked absent after scheduled shift end'}},{upsert:true});
 }
}

async function accrueMonthlyLeave(tenant){
 const today=localKey(new Date(),'Asia/Kolkata'),[year,month]=today.slice(0,7).split('-').map(Number),runDate=`${year}-${String(month).padStart(2,'0')}`;
 let checkpoint;try{checkpoint=await AutomationRun.create({tenantId:tenant._id,jobKey:'monthly-leave-accrual',runDate,status:'processing',lockedUntil:new Date(Date.now()+30*60000)});}catch{checkpoint=await AutomationRun.findOne({tenantId:tenant._id,jobKey:'monthly-leave-accrual',runDate});if(!checkpoint||checkpoint.status==='completed'||(checkpoint.lockedUntil&&checkpoint.lockedUntil>Date.now()))return;checkpoint.status='processing';checkpoint.lockedUntil=new Date(Date.now()+30*60000);checkpoint.attempts++;await checkpoint.save();}
 try{const policies=await LeavePolicy.find({tenantId:tenant._id,active:true,accrualPerMonth:{$gt:0}}).lean();for(const policy of policies){const employees=await Employee.find({tenantId:tenant._id,status:'active',...(policy.branchId?{branchId:policy.branchId}:{})}).select('_id').lean();for(const employee of employees){const session=await require('mongoose').startSession();try{await session.withTransaction(async()=>{await LeaveAccrual.create([{tenantId:tenant._id,employeeId:employee._id,leaveTypeId:policy.leaveTypeId,year,month,amount:policy.accrualPerMonth,policyId:policy._id}],{session});const balanceFilter={tenantId:tenant._id,employeeId:employee._id,leaveTypeId:policy.leaveTypeId,year},existing=await LeaveBalance.findOne(balanceFilter).session(session);if(existing){existing.accrued=Number(existing.accrued||0)+Number(policy.accrualPerMonth);await existing.save({session});}else{const previous=await LeaveBalance.findOne({tenantId:tenant._id,employeeId:employee._id,leaveTypeId:policy.leaveTypeId,year:year-1}).session(session),available=previous?Math.max(0,previous.opening+previous.accrued+previous.adjusted-previous.used):0,carry=Math.min(available,Number(policy.carryForwardLimit||0));await LeaveBalance.create([{...balanceFilter,opening:Number(policy.annualAllowance||0),adjusted:carry,accrued:Number(policy.accrualPerMonth),used:0}],{session});}});}catch(e){if(e.code!==11000)throw e;}finally{await session.endSession();}}}checkpoint.status='completed';checkpoint.completedAt=new Date();checkpoint.lockedUntil=undefined;await checkpoint.save();}catch(e){checkpoint.status='failed';checkpoint.lastError=e.message;checkpoint.lockedUntil=undefined;await checkpoint.save();throw e;}
}
async function runDailyAutomations(){const tenants=await Tenant.find({status:{$in:['active','trial']}}).select('_id').lean();for(const tenant of tenants){try{await runTenantDaily(tenant)}catch(e){process.stderr.write(`HRM reminders ${tenant._id}: ${e.message}\n`)}try{await accrueMonthlyLeave(tenant)}catch(e){process.stderr.write(`Leave accrual ${tenant._id}: ${e.message}\n`)}}}
function startNotificationWorker(){let busy=false,absenceBusy=false,reportBusy=false;const tick=async()=>{if(busy)return;busy=true;try{await runOutboxBatch(25)}catch(e){process.stderr.write(`Notification worker: ${e.message}\n`)}finally{busy=false}};const absenceTick=async()=>{if(absenceBusy)return;absenceBusy=true;try{await markAbsences()}catch(e){process.stderr.write(`Attendance scheduler: ${e.message}\n`)}finally{absenceBusy=false}};const daily=async()=>{try{await runDailyAutomations()}catch(e){process.stderr.write(`HRM scheduler: ${e.message}\n`)}};
 const reportTick=async()=>{if(reportBusy)return;reportBusy=true;try{await require('./scheduledReportWorker').runScheduledReportsBatch(10)}catch(e){process.stderr.write(`Scheduled reports: ${e.message}\n`)}finally{reportBusy=false}};
 tick();absenceTick();daily();reportTick();const a=setInterval(tick,10000),b=setInterval(absenceTick,5*60*1000),c=setInterval(daily,60*60*1000),d=setInterval(reportTick,60*1000);a.unref?.();b.unref?.();c.unref?.();d.unref?.();return ()=>{clearInterval(a);clearInterval(b);clearInterval(c);clearInterval(d)};}
module.exports={startNotificationWorker,runOutboxBatch,runDailyAutomations};
