const {Doctor,Branch,DoctorSchedule,DoctorLeave,Appointment,SlotCounter}=require('../models');
const ACTIVE_APPOINTMENT_STATUSES=['scheduled','booked','confirmed','checked_in','waiting','called','in_consultation'];
function timeMinutes(value){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||'')))return null;const [h,m]=value.split(':').map(Number);return h*60+m}
function localToUtc(date,time,timeZone){const [y,mo,d]=date.split('-').map(Number),[hh,mm]=time.split(':').map(Number);const target=Date.UTC(y,mo-1,d,hh,mm);let guess=target;for(let i=0;i<3;i++){const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));const represented=Date.UTC(Number(v.year),Number(v.month)-1,Number(v.day),Number(v.hour),Number(v.minute));guess+=target-represented;}return new Date(guess)}
function dateWeekday(date){return new Date(`${date}T12:00:00Z`).getUTCDay()}
function formatTime(date,timeZone){return new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date)}
async function buildAvailability({tenantId,doctorId,branchId,date}){
 const parsedDate=new Date(`${date}T00:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==date)throw Object.assign(new Error('Date must be a valid YYYY-MM-DD date'),{status:422});
 const [doctor,branch]=await Promise.all([Doctor.findOne({_id:doctorId,tenantId,status:{$nin:['inactive','archived']},branchIds:branchId}).lean(),Branch.findOne({_id:branchId,tenantId,active:true}).lean()]);
 if(!doctor||!branch)throw Object.assign(new Error('Doctor or branch not found'),{status:404});
 const tz=branch.timezone||'Asia/Kolkata';const weekday=dateWeekday(date);
 const schedules=await DoctorSchedule.find({tenantId,doctorId,branchId,dayOfWeek:weekday,active:true,effectiveFrom:{$lte:localToUtc(date,'23:59',tz)},$or:[{effectiveTo:null},{effectiveTo:{$gte:localToUtc(date,'00:00',tz)}}]}).lean();
 if(!schedules.length)return {doctor,branch,slots:[]};
 const dayStart=localToUtc(date,'00:00',tz),dayEnd=localToUtc(date,'23:59',tz);
 const [leaves,appointments,counters]=await Promise.all([
  DoctorLeave.find({tenantId,doctorId,branchId,status:'approved',startAt:{$lt:dayEnd},endAt:{$gt:dayStart}}).lean(),
  Appointment.find({tenantId,doctorId,branchId,status:{$in:ACTIVE_APPOINTMENT_STATUSES},startAt:{$lt:dayEnd},endAt:{$gt:dayStart}}).select('startAt endAt').lean(),
  SlotCounter.find({tenantId,doctorId,branchId,startAt:{$gte:dayStart,$lte:dayEnd}}).lean()
 ]);
 const counterMap=new Map(counters.map(c=>[c.startAt.toISOString(),c]));const slots=[];
 for(const schedule of schedules){for(const session of schedule.sessions||[]){const start=timeMinutes(session.startTime),end=timeMinutes(session.endTime),breakStart=session.breakStart?timeMinutes(session.breakStart):null,breakEnd=session.breakEnd?timeMinutes(session.breakEnd):null;if(start===null||end===null||end<=start)continue;for(let m=start;m+schedule.slotDuration<=end;m+=schedule.slotDuration){if(breakStart!==null&&breakEnd!==null&&m<breakEnd&&m+schedule.slotDuration>breakStart)continue;const hh=String(Math.floor(m/60)).padStart(2,'0'),mm=String(m%60).padStart(2,'0'),localTime=`${hh}:${mm}`,startAt=localToUtc(date,localTime,tz),endAt=new Date(startAt.getTime()+schedule.slotDuration*60000);if(startAt<=new Date())continue;if(leaves.some(l=>l.startAt<endAt&&l.endAt>startAt))continue;const overlaps=appointments.filter(a=>a.startAt<endAt&&a.endAt>startAt);if(overlaps.some(a=>a.startAt.getTime()!==startAt.getTime()||a.endAt.getTime()!==endAt.getTime()))continue;const counter=counterMap.get(startAt.toISOString());const reserved=Math.max(counter?.reservedCount||0,overlaps.length);const capacity=schedule.maxAppointmentsPerSlot||1;if(reserved>=capacity)continue;slots.push({startAt,endAt,localTime,available:capacity-reserved,capacity,reservedCount:reserved,consultationType:schedule.consultationType,departmentId:schedule.departmentId||null,scheduleId:schedule._id});}}}
 const unique=new Map();for(const slot of slots)if(!unique.has(slot.startAt.toISOString()))unique.set(slot.startAt.toISOString(),slot);
 return {doctor,branch,slots:[...unique.values()].sort((a,b)=>a.startAt-b.startAt)};
}
async function reserveSlot({tenantId,doctorId,branchId,startAt,endAt,capacity=1,initialReservedCount=0,session}){
 const key=[tenantId,doctorId,branchId,new Date(startAt).toISOString()].join(':');
 try{
  await SlotCounter.findOneAndUpdate({key},{$setOnInsert:{tenantId,doctorId,branchId,startAt,endAt,capacity,reservedCount:initialReservedCount}},{new:true,upsert:true,setDefaultsOnInsert:true,session});
  await SlotCounter.updateOne({key,reservedCount:{$lt:initialReservedCount}},{$set:{reservedCount:initialReservedCount}},{session});
  const result=await SlotCounter.findOneAndUpdate({key,reservedCount:{$lt:capacity}},{$inc:{reservedCount:1}},{new:true,session});
  if(result)return key;
 }catch(error){if(error.code!==11000)throw error;}
 throw Object.assign(new Error('This appointment slot has just been booked. Please choose another time.'),{status:409});
}
async function releaseSlot({tenantId,doctorId,branchId,startAt,session}){const key=[tenantId,doctorId,branchId,new Date(startAt).toISOString()].join(':');await SlotCounter.updateOne({key,reservedCount:{$gt:0}},{$inc:{reservedCount:-1}},{session})}
module.exports={buildAvailability,reserveSlot,releaseSlot,ACTIVE_APPOINTMENT_STATUSES,localToUtc,formatTime};
