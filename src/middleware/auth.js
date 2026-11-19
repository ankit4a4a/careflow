const jwt=require('jsonwebtoken');
const {User,Tenant,Branch,Role,Session}=require('../models');
const asyncHandler=require('../utils/asyncHandler');
// Small in-memory TTL cache: tenant status, role permissions and module gating used to cost ~5 DB queries on EVERY request.
const CACHE_TTL=Number(process.env.AUTH_CACHE_TTL_MS??15000);const _cache=new Map();
const cached=async(key,loader)=>{if(!CACHE_TTL)return loader();const now=Date.now(),hit=_cache.get(key);if(hit&&hit.exp>now)return hit.val;const val=await loader();_cache.set(key,{val,exp:now+CACHE_TTL});if(_cache.size>2000){for(const [k,v] of _cache)if(v.exp<now)_cache.delete(k);if(_cache.size>2000)_cache.clear()}return val};
exports.clearAuthCache=()=>_cache.clear();
const DEFAULT_PERMISSIONS={
 branch_admin:['dashboard.view','ipd.view','ipd.create','ipd.update','ipd.cancel','ward.view','ward.manage','bed.view','bed.manage','bed.allocate','bed.transfer','nursing.view','nursing.notes.create','nursing.notes.finalize','vitals.view','vitals.create','medication.mar.view','medication.mar.administer','medication.mar.hold','doctor.rounds.view','doctor.rounds.manage','icu.view','icu.manage','ot.view','ot.manage','surgery.schedule','surgery.update','discharge.view','discharge.create','discharge.approve','discharge.finalize','ipd.billing.view','ipd.billing.manage','admissions.manage','billing.services.manage','billing.tax.manage','billing.expenses.manage','billing.expenses.approve','billing.expenses.pay','billing.refunds','billing.refunds.approve','billing.refunds.process','billing.accounting.view','billing.accounting.manage','reports.view','patients.view','patients.create','patients.edit','patients.delete','appointments.view','appointments.create','appointments.edit','doctors.view','laboratory.view','laboratory.manage','radiology.view','radiology.manage','admissions.view','doctors.manage','billing.view','billing.create','billing.payments','pharmacy.view','pharmacy.manage','pharmacy.supplier.manage','pharmacy.purchase.approve','pharmacy.stock.adjust.approve','pharmacy.transfer.approve','pharmacy.reports.view','reports.view','users.view','users.create','users.edit','branches.view','hrm.view','employee.view','employee.create','employee.update','employee.archive','employee.salary.view','employee.documents.manage','attendance.view','attendance.manage','attendance.correct','shifts.manage','leave.view','leave.apply','leave.approve','payroll.view','payroll.manage','payroll.approve','payroll.pay','recruitment.manage','appraisal.manage','reimbursement.manage','crm.view','crm.manage','feedback.manage','complaints.manage','notifications.manage','notifications.self.view','notifications.self.manage','analytics.view','analytics.branch.view','reports.create','reports.export','reports.schedule','reports.manage','branch.settings.manage','platform.health.view'],
 employee:['employee.self.view','employee.self.update','attendance.self.view','attendance.self.checkin','attendance.self.checkout','leave.self.view','leave.view','leave.apply','payslip.self.view','documents.self.view','notifications.self.view','notifications.self.manage'],
 doctor:['dashboard.view','ipd.view','admissions.view','doctor.rounds.view','doctor.rounds.manage','discharge.view','discharge.create','discharge.approve','icu.view','ot.view','surgery.schedule','surgery.update','patients.view','clinical.notes','appointments.view','appointments.create','appointments.edit','doctors.view','doctors.manage','laboratory.view','laboratory.manage','radiology.view','radiology.manage','pharmacy.view'],
 receptionist:['dashboard.view','ipd.view','ipd.create','admissions.view','ward.view','bed.view','bed.allocate','billing.view','billing.create','billing.payments','patients.view','patients.create','patients.edit','appointments.view','appointments.create','appointments.edit','appointments.cancel','doctors.view','billing.view','billing.create','billing.payments','branches.view'],
 nurse:['dashboard.view','ipd.view','admissions.view','ward.view','bed.view','nursing.view','nursing.notes.create','nursing.notes.finalize','vitals.view','vitals.create','medication.mar.view','medication.mar.administer','medication.mar.hold','icu.view','icu.manage','discharge.view','discharge.approve','patients.view','appointments.view','appointments.edit','clinical.notes','laboratory.view','laboratory.manage'],
 pharmacist:['dashboard.view','pharmacy.view','pharmacy.manage','pharmacy.supplier.manage','pharmacy.reports.view','clinical.notes'],lab_technician:['dashboard.view','laboratory.view','laboratory.manage','radiology.view','radiology.manage'],
 accountant:['dashboard.view','ipd.view','ipd.billing.view','ipd.billing.manage','billing.view','billing.create','billing.payments','billing.services.manage','billing.tax.manage','billing.discount.override','billing.refunds','billing.refunds.approve','billing.refunds.process','billing.expenses.manage','billing.expenses.approve','billing.expenses.pay','billing.accounting.view','billing.accounting.manage','pharmacy.view','pharmacy.supplier.manage','pharmacy.reports.view','reports.view','branches.view'],patient:[]
};
exports.DEFAULT_PERMISSIONS=DEFAULT_PERMISSIONS;
// LOGIN REMOVED: every request is automatically treated as the default admin (ADMIN_EMAIL from .env,
// else the first active hospital_admin, else a super_admin). No token / session / password is checked.
let _autoUser=null,_autoUserAt=0;
const resolveAutoUser=async()=>{
 if(_autoUser&&Date.now()-_autoUserAt<15000)return _autoUser;
 const email=String(process.env.ADMIN_EMAIL||process.env.DEV_USER_EMAIL||'').toLowerCase().trim();
 let u=email?await User.findOne({email,active:true,tenantId:{$ne:null}}):null;
 if(!u)u=await User.findOne({role:'hospital_admin',active:true,tenantId:{$ne:null}}).sort({createdAt:1});
 if(!u)u=await User.findOne({role:'super_admin',active:true});
 if(u){_autoUser=u;_autoUserAt=Date.now()}
 return u;
};
exports.authenticate=asyncHandler(async(req,res,next)=>{
 if(req.user&&req.permissions)return next();
 const user=await resolveAutoUser();
 if(!user)return res.status(500).json({success:false,message:'No admin user found in database. Set ADMIN_EMAIL / ADMIN_PASSWORD in .env and restart (or run: npm run reset-admin).'});
 req.sessionId=null;req.user=user;req.tenantId=user.tenantId?String(user.tenantId):null;req.branchIds=(user.branchIds||[]).map(String);
 if(user.role==='super_admin'){req.permissions=['*']}
 else{
  const roleKeys=[user.role,...(user.customRoles||[])];
  const roles=await cached('r:'+req.tenantId+':'+roleKeys.join(','),()=>Role.find({tenantId:req.tenantId,key:{$in:roleKeys}}).lean());
  req.permissions=[...(DEFAULT_PERMISSIONS[user.role]||[]),...(user.permissions||[]),...roles.flatMap(r=>r.permissions||[])];
  if(user.role==='hospital_admin')req.permissions.push('*');
 }
 next();
});
exports.allowRoles=(...roles)=>(req,res,next)=>{if(!req.user||!roles.includes(req.user.role))return res.status(403).json({success:false,message:'Insufficient permissions'});next()};
exports.requireTenant=(req,res,next)=>{if(!req.tenantId)return res.status(403).json({success:false,message:'Tenant context required'});next()};
exports.requirePermission=(permission)=>(req,res,next)=>{if(req.user?.role==='super_admin'||req.permissions?.includes('*')||req.permissions?.includes(permission))return next();return res.status(403).json({success:false,message:'Permission denied',required:permission})};
exports.requireBranchAccess=asyncHandler(async(req,res,next)=>{
 if(req.user.role==='super_admin'||req.user.role==='hospital_admin')return next();
 const requested=req.params.branchId||req.body.branchId||req.query.branchId;
 if(requested&&!req.branchIds.includes(String(requested)))return res.status(403).json({success:false,message:'Branch access denied'});
 if(!requested&&req.branchIds.length===1)req.branchId=req.branchIds[0];
 next();
});

exports.requireModule=(moduleKey)=>asyncHandler(async(req,res,next)=>{
 const decision=await cached(`m:${req.tenantId}:${moduleKey}`,async()=>{
  const {TenantSubscription,SubscriptionPlan,SystemSetting}=require('../models');
  const override=await SystemSetting.findOne({key:`tenant:${req.tenantId}:modules`}).lean();
  if(override?.value?.[moduleKey]===false)return {status:403,body:{success:false,message:'This module is disabled for your organization.'}};
  const sub=await TenantSubscription.findOne({tenantId:req.tenantId}).lean();
  const plan=Array.isArray(sub?.planSnapshot?.modules)?sub.planSnapshot:await SubscriptionPlan.findOne({key:sub?.plan}).lean();
  if(!plan)return null;
  const modules=Array.isArray(plan.modules)?plan.modules:[];
  const aliases={opd:['patients','appointments'],finance:['billing'],patient_portal:['patients','appointments']};
  if(modules.includes('all')||modules.includes(moduleKey)||(aliases[moduleKey]||[]).some(x=>modules.includes(x)))return null;
  return {status:403,body:{success:false,message:'This module is not included in the active subscription plan.',module:moduleKey,upgradeRequired:true}};
 });
 if(decision)return res.status(decision.status).json(decision.body);
 next();
});

// Skip this router entirely (next('router')) when it has no route for the request, so a router mounted at /api/v1
// does not authenticate / module-gate requests that belong to other routers, and unknown URLs reach the 404 handler.
exports.onlyKnownRoutes=(router)=>(req,res,next)=>{
 const method=req.method.toLowerCase()==='head'?'get':req.method.toLowerCase();
 const known=router.stack.some(l=>l.route&&(l.route.methods[method]||l.route.methods._all)&&l.regexp.test(req.path));
 return known?next():next('router');
};
