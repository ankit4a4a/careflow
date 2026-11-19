// Makes the admin login from .env (ADMIN_EMAIL / ADMIN_PASSWORD) work on EVERY server start.
// Order matters: 1) account + password FIRST  2) organization (tenant) / branch / subscription  3) self-check.
// The .env admin is always a hospital_admin that BELONGS to an organization (otherwise the dashboard says "Tenant context required").
const argon2=require('argon2');
module.exports=async function ensureEnvAdmin(){
 const email=String(process.env.ADMIN_EMAIL||'').toLowerCase().trim(),password=process.env.ADMIN_PASSWORD||'';
 if(!email||!password){console.log('[admin-bootstrap] ADMIN_EMAIL / ADMIN_PASSWORD not set in .env - skipped');return}
 try{
  const {Tenant,Branch,User,SubscriptionPlan,TenantSubscription}=require('../models');
  const passwordHash=await argon2.hash(password);
  const slug=process.env.ADMIN_WORKSPACE_SLUG||'careflow-demo';
  const defaultTenant=async()=>{let t=await Tenant.findOne({slug});if(!t)t=await Tenant.create({name:process.env.ADMIN_ORG_NAME||'CareFlow Clinic',slug,status:'active',plan:'professional'});return t};

  // ---- 1) account + password (nothing else may block this) ----
  let users=await User.find({email});
  if(users.length){
   for(const u of users){
    u.passwordHash=passwordHash;u.active=true;
    if(!u.emailVerifiedAt)u.emailVerifiedAt=new Date();
    u.role='hospital_admin';
    await u.save();
   }
  }else{
   const tenant=await defaultTenant();
   users=[await User.create({tenantId:tenant._id,branchIds:[],name:process.env.ADMIN_NAME||'Administrator',email,passwordHash,role:'hospital_admin',active:true,emailVerifiedAt:new Date()})];
  }

  // ---- 2) organization readiness (best effort, never blocks login) ----
  const hasTenantAccount=users.some(u=>u.tenantId);
  for(const u of users){
   try{
    if(!u.tenantId){
     if(hasTenantAccount){u.active=false;await u.save();console.warn('[admin-bootstrap] disabled a duplicate account with this email that had no organization');continue}
     const t=await defaultTenant();u.tenantId=t._id;u.branchIds=[];await u.save();console.log('[admin-bootstrap] attached the admin account to organization "'+t.slug+'"');
    }
    const tenant=await Tenant.findById(u.tenantId);if(!tenant)continue;
    if(tenant.status==='suspended'){tenant.status='active';await tenant.save()}
    await SubscriptionPlan.updateOne({key:'professional'},{$setOnInsert:{key:'professional',name:'Professional',monthlyAmount:4999,limits:{branches:5,users:50},modules:['all']}},{upsert:true});
    const sub=await TenantSubscription.findOne({tenantId:tenant._id});
    if(!sub){const plan=await SubscriptionPlan.findOne({key:'professional'}).lean();await TenantSubscription.create({tenantId:tenant._id,plan:'professional',status:'active',monthlyAmount:plan?.monthlyAmount||4999,planSnapshot:{key:'professional',name:'Professional',modules:['all'],limits:plan?.limits}})}
    else if(!(sub.planSnapshot?.modules||[]).includes('all')){sub.planSnapshot={...(sub.planSnapshot||{}),key:sub.planSnapshot?.key||'professional',modules:['all']};sub.markModified('planSnapshot');if(['expired','cancelled','suspended'].includes(sub.status))sub.status='active';await sub.save()}
    let branch=await Branch.findOne({tenantId:tenant._id});
    if(!branch)branch=await Branch.create({tenantId:tenant._id,name:'Main Clinic',code:'MAIN',active:true});
    if(!(u.branchIds||[]).length){u.branchIds=[branch._id];await u.save()}
   }catch(e){console.error('[admin-bootstrap] warning - organization setup incomplete:',e.message)}
  }

  // ---- 3) self-check: password verifies AND account belongs to an organization ----
  const check=await User.find({email,active:true}).select('+passwordHash');
  let good=0,noTenant=0;for(const c of check){try{if(await argon2.verify(c.passwordHash,password)){good++;if(!c.tenantId)noTenant++}}catch{}}
  if(good&&!noTenant)console.log(`Login ready -> email: ${email}  password: (value of ADMIN_PASSWORD in .env)  [${good} account(s) verified, organization attached]`);
  else if(good)console.error(`*** Login works for ${email} but the account has NO organization - dashboard will say "Tenant context required"`);
  else console.error(`*** SELF-CHECK FAILED: could not verify login for ${email}`);
 }catch(e){console.error('*** ensureEnvAdmin FAILED - .env admin login will NOT work: '+(e.stack||e.message))}
};
