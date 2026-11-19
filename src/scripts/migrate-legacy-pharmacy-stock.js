
require('dotenv').config();
const mongoose=require('mongoose');
const {Tenant,Branch,MedicineBatch,InventoryTransaction}=require('../models');
async function run(){
 const tenantId=process.env.PHARMACY_LEGACY_TENANT_ID,branchId=process.env.PHARMACY_LEGACY_BRANCH_ID;
 if(!tenantId||!mongoose.isValidObjectId(tenantId)||!branchId||!mongoose.isValidObjectId(branchId))throw new Error('Set PHARMACY_LEGACY_TENANT_ID and PHARMACY_LEGACY_BRANCH_ID to explicit ObjectIds before running this migration.');
 await mongoose.connect(process.env.MONGODB_URI);
 const tenant=await Tenant.findById(tenantId);const branch=await Branch.findOne({_id:branchId,tenantId,active:true});
 if(!tenant||!branch)throw new Error('The selected tenant or active branch was not found.');
 const batches=await MedicineBatch.find({tenantId,branchId:{$exists:false}}).lean();
 const seen=new Set();
 for(const batch of batches){const key=`${batch.medicineId}:${batch.batchNo}`;if(seen.has(key))throw new Error(`Duplicate legacy medicine/batch key ${key}; resolve duplicate lots before migration.`);seen.add(key);const collision=await MedicineBatch.findOne({tenantId,branchId:branch._id,medicineId:batch.medicineId,batchNo:batch.batchNo});if(collision)throw new Error(`Batch ${batch.batchNo} already exists in the selected branch; reconcile before migration.`);}
 let migrated=0,skipped=0;
 for(const batch of batches){
  const session=await mongoose.startSession();
  try{await session.withTransaction(async()=>{
   const current=await MedicineBatch.findOne({_id:batch._id,tenantId,branchId:{$exists:false}}).session(session);
   if(!current){skipped++;return;}
   current.branchId=branch._id;await current.save({session});
   if(Number(current.quantity||0)>0){
    await InventoryTransaction.updateOne({tenantId,idempotencyKey:`legacy-stock-${current._id}`},{$setOnInsert:{tenantId,branchId:branch._id,medicineId:current.medicineId,batchId:current._id,type:'in',quantity:current.quantity,quantityIn:current.quantity,quantityOut:0,previousBalance:0,newBalance:current.quantity,sourceType:'legacy_opening_balance',sourceId:current._id,idempotencyKey:`legacy-stock-${current._id}`,reason:'Opening balance imported from pre-Phase-7 inventory',performedBy:null}},{upsert:true,session});
   }
   migrated++;
  });}finally{await session.endSession();}
 }
 process.stdout.write(JSON.stringify({tenantId,branchId,migrated,skipped,legacyBatchesFound:batches.length})+'\n');
 await mongoose.disconnect();
}
run().catch(async e=>{process.stderr.write((e.stack||e.message)+'\n');await mongoose.disconnect().catch(()=>{});process.exitCode=1;});
