
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const mongoose=require('mongoose');
const M=require('../models');
const {REPORTS,getReport}=require('../routes/phase11');
const {DEFAULT_PERMISSIONS}=require('../middleware/auth');
function localParts(date,zone){const p=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return Object.fromEntries(p.map(x=>[x.type,x.value]));}
function localKey(date,zone){const p=localParts(date,zone);return `${p.year}-${p.month}-${p.day}`;}
function dateRange(freq,now,zone){
 const today=localKey(now,zone);const [y,m,d]=today.split('-').map(Number);const end=new Date(Date.UTC(y,m-1,d-1));const endKey=end.toISOString().slice(0,10);
 if(freq==='daily')return {from:endKey,to:endKey,runDate:`daily:${endKey}`};
 if(freq==='weekly'){const start=new Date(Date.UTC(y,m-1,d-7));return {from:start.toISOString().slice(0,10),to:endKey,runDate:`weekly:${start.toISOString().slice(0,10)}`};}
 const first=new Date(Date.UTC(y,m-2,1));const last=new Date(Date.UTC(y,m-1,0));return {from:first.toISOString().slice(0,10),to:last.toISOString().slice(0,10),runDate:`monthly:${first.toISOString().slice(0,7)}`};
}
function nextRun(freq,now){const d=new Date(now);if(freq==='daily')d.setDate(d.getDate()+1);else if(freq==='weekly')d.setDate(d.getDate()+7);else d.setMonth(d.getMonth()+1);return d;}
async function runOne(schedule){
 const now=new Date(),range=dateRange(schedule.frequency,now,schedule.timezone||'Asia/Kolkata'),jobKey=`scheduled-report:${schedule._id}`;
 let run=await M.AutomationRun.findOneAndUpdate(
  {tenantId:schedule.tenantId,jobKey,runDate:range.runDate,attempts:{$lt:5},status:{$in:['failed','pending','processing']},$or:[{status:{$in:['failed','pending']}},{lockedUntil:null},{lockedUntil:{$lte:now}}]},
  {$set:{status:'processing',lockedUntil:new Date(now.getTime()+5*60000)},$inc:{attempts:1}},
  {new:true}
 );
 if(!run){
  const existing=await M.AutomationRun.findOne({tenantId:schedule.tenantId,jobKey,runDate:range.runDate});
  if(existing)return false;
  try{run=await M.AutomationRun.create({tenantId:schedule.tenantId,jobKey,runDate:range.runDate,status:'processing',lockedUntil:new Date(now.getTime()+5*60000),attempts:1});}
  catch(e){if(e.code===11000)return false;throw e;}
 }
 try{
  let exportDoc=run.resultRef?await M.PrivateReportExport.findOne({_id:run.resultRef,tenantId:schedule.tenantId}):null;
  if(!exportDoc){
   const owner=await M.User.findOne({_id:schedule.ownerId,tenantId:schedule.tenantId,active:true}).lean();
   if(!owner)throw new Error('Schedule owner is no longer active in this tenant');
   const roleRows=await M.Role.find({tenantId:schedule.tenantId,key:{$in:[owner.role,...(owner.customRoles||[])]}}).lean();
   const permissions=[...(DEFAULT_PERMISSIONS[owner.role]||[]),...(owner.permissions||[]),...roleRows.flatMap(x=>x.permissions||[])];if(owner.role==='hospital_admin')permissions.push('*');
   const query={...(schedule.filters||{}),...range,limit:500,page:1};
   const fakeReq={tenantId:String(schedule.tenantId),user:owner,permissions,branchIds:(owner.branchIds||[]).map(String),query,body:query};
   const data=await getReport(fakeReq,schedule.reportType,query);
   const storage=path.resolve(process.env.REPORT_PRIVATE_STORAGE_DIR||path.join(__dirname,'../../private-uploads/reports'));fs.mkdirSync(storage,{recursive:true,mode:0o700});
   const filename=`${crypto.randomUUID()}.csv`,target=path.join(storage,filename),quote=v=>{let s=String(v??'');if(/^[=+@-]/.test(s))s="\'"+s;return `"${s.replace(/"/g,'""')}"`;};
   const lines=[data.columns.map(quote).join(','),...data.rows.map(row=>data.columns.map(c=>quote(c.split('.').reduce((a,k)=>a?.[k],row))).join(','))];fs.writeFileSync(target,'\ufeff'+lines.join('\r\n'),{mode:0o600});
   const stat=fs.statSync(target);exportDoc=await M.PrivateReportExport.create({tenantId:schedule.tenantId,branchId:schedule.branchId,branchScope:schedule.branchScope||[],createdBy:schedule.ownerId,reportType:schedule.reportType,title:data.title,format:'csv',storageKey:filename,originalName:`${data.title.replace(/[^a-z0-9_-]/gi,'_')}_${range.runDate.replace(/:/g,'-')}.csv`,mimeType:'text/csv',size:stat.size,filters:query,expiresAt:new Date(Date.now()+30*86400000)});
   run.resultRef=exportDoc._id;await run.save();await M.AuditLog.create({tenantId:schedule.tenantId,userId:schedule.ownerId,action:'report.export.scheduled',resource:'report_export',resourceId:String(exportDoc._id),metadata:{reportType:schedule.reportType,format:'csv',scheduledReportId:String(schedule._id)}});
  }
  const recipients=await M.User.find({_id:{$in:schedule.recipients||[]},tenantId:schedule.tenantId,active:true}).select('_id').lean();
  for(const recipient of recipients){
   const userId=recipient._id;const key=`scheduled-report:${schedule._id}:${range.runDate}:${userId}`;
   await M.NotificationOutbox.updateOne({tenantId:schedule.tenantId,idempotencyKey:key},{$setOnInsert:{tenantId:schedule.tenantId,branchId:schedule.branchId,userId,category:'system',title:`Scheduled report ready: ${schedule.name}`,message:`Your scheduled ${schedule.reportType.replaceAll('_',' ')} report is ready. Open Export History in CareFlow to download it.`,channels:['inApp'],payload:{link:'/reports'},idempotencyKey:key,status:'pending',nextAttemptAt:new Date()}},{upsert:true});
  }
  schedule.lastRunAt=now;schedule.nextRunAt=nextRun(schedule.frequency,now);schedule.runHistory.push({runKey:range.runDate,status:'queued',startedAt:now,finishedAt:new Date(),recipientCount:recipients.length});if(schedule.runHistory.length>50)schedule.runHistory=schedule.runHistory.slice(-50);await schedule.save();
  run.status='completed';run.completedAt=new Date();run.lockedUntil=undefined;run.lastError=undefined;await run.save();return true;
 }catch(e){run.status='failed';run.lastError=String(e.message||e).slice(0,1000);run.lockedUntil=undefined;await run.save();schedule.runHistory.push({runKey:range.runDate,status:'failed',startedAt:now,finishedAt:new Date(),error:run.lastError});if(schedule.runHistory.length>50)schedule.runHistory=schedule.runHistory.slice(-50);await schedule.save();throw e;}
}
async function runScheduledReportsBatch(limit=10){
 const due=await M.ScheduledReport.find({status:'active',nextRunAt:{$lte:new Date()}}).sort({nextRunAt:1}).limit(limit);
 let completed=0;for(const s of due){try{if(await runOne(s))completed++;}catch(e){process.stderr.write(`Scheduled report ${s._id}: ${e.message}\n`);}}
 return completed;
}
module.exports={runScheduledReportsBatch};
