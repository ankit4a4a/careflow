
const router=require('express').Router();
const mongoose=require('mongoose');
const {authenticate,requireTenant,requireModule,requirePermission,allowRoles}=require('../middleware/auth');
const asyncHandler=require('../utils/asyncHandler');
const audit=require('../middleware/audit');
const {
 Medicine,MedicineBatch,InventoryTransaction,MedicineCategory,GenericMedicine,Supplier,
 PurchaseOrder,GoodsReceipt,Dispensing,StockTransfer,StockAdjustment,PharmacySale,
 PharmacyReturn,DispensingReversal,SupplierReturn,PharmacyAlert,SupplierPayment,Prescription,Patient,
 Branch,Invoice,BillingSourceLink,TaxConfiguration,Sequence,ChartOfAccount,JournalEntry,
 LedgerTransaction,Payment,Refund,CreditNote,Notification,Doctor,User
}=require('../models');
const {notifyPatient}=require('../services/notifications');
router.use(require('../middleware/auth').onlyKnownRoutes(router));router.use(authenticate,requireTenant);router.use(requireModule('pharmacy'));

const ADMIN=['hospital_admin','super_admin'];
const isAdmin=req=>ADMIN.includes(req.user.role);
const branchAllowed=(req,id)=>isAdmin(req)||req.branchIds.includes(String(id));
const branchFilter=req=>isAdmin(req)?{}:{branchId:{$in:req.branchIds}};
const fail=(res,message,status=400)=>res.status(status).json({success:false,message});
const clean=(v,n=300)=>String(v??'').trim().slice(0,n);
const money=v=>Math.round((Number(v)+Number.EPSILON)*100)/100;
const qty=v=>Math.round((Number(v)+Number.EPSILON)*1000)/1000;
const validId=v=>mongoose.isValidObjectId(v);
async function nextNo(tenantId,kind,session){
 const year=new Date().getFullYear(),key=`${tenantId}:pharmacy:${kind}:${year}`;
 const x=await Sequence.findOneAndUpdate({key},{$inc:{value:1}},{new:true,upsert:true,setDefaultsOnInsert:true,session});
 return `${kind}-${year}-${String(x.value).padStart(6,'0')}`;
}
async function branchDoc(req,id){
 if(!id||!branchAllowed(req,id))return null;
 return Branch.findOne({_id:id,tenantId:req.tenantId,active:true});
}
async function ensurePharmacyAccounts(tenantId,session){
 const defs=[['1000','Cash and Bank','asset'],['1100','Accounts Receivable','asset'],['1200','Pharmacy Inventory','asset'],['1300','Input GST Credit','asset'],['2000','Accounts Payable','liability'],['2100','GST Payable','liability'],['4100','Pharmacy Sales Revenue','income']];
 const out={};
 for(const [code,name,type] of defs)out[code]=await ChartOfAccount.findOneAndUpdate({tenantId,code},{$setOnInsert:{tenantId,code,name,type,system:true}},{new:true,upsert:true,setDefaultsOnInsert:true,session});
 return out;
}
async function postPharmacyJournal({tenantId,branchId,sourceType,sourceId,description,lines,userId,session}){
 const existing=await JournalEntry.findOne({tenantId,sourceType,sourceId}).session(session);
 if(existing)return existing;
 const accounts=await ensurePharmacyAccounts(tenantId,session);
 const rows=lines.map(l=>({accountId:accounts[l.code]._id,accountCode:l.code,accountName:accounts[l.code].name,debit:money(l.debit||0),credit:money(l.credit||0),memo:l.memo||''}));
 const debit=money(rows.reduce((n,x)=>n+x.debit,0)),credit=money(rows.reduce((n,x)=>n+x.credit,0));
 if(!rows.length||Math.abs(debit-credit)>0.01)throw Object.assign(new Error('Pharmacy journal entry is not balanced'),{status:422});
 const entry=await JournalEntry.create([{tenantId,branchId,entryNo:await nextNo(tenantId,'JRN',session),description,sourceType,sourceId,lines:rows,totalDebit:debit,totalCredit:credit,status:'posted',createdBy:userId}],{session});
 for(const line of rows)await LedgerTransaction.create([{tenantId,branchId,journalEntryId:entry[0]._id,accountId:line.accountId,debit:line.debit,credit:line.credit,sourceType,sourceId,postedAt:new Date()}],{session});
 return entry[0];
}
async function addStockLedger({tenantId,branchId,medicineId,batchId,type,quantity,sourceType,sourceId,userId,session,reason,idempotencyKey,quantityIn,quantityOut}){
 const q=qty(quantity);
 const batch=await MedicineBatch.findOne({_id:batchId,tenantId,branchId,medicineId}).session(session);
 if(!batch)throw Object.assign(new Error('Medicine batch not found in this branch'),{status:404});
 const previous=qty(batch.quantity||0),incoming=quantityIn===undefined?(['purchase_receipt','transfer_in','customer_return','return'].includes(type)?q:0):qty(quantityIn);
 const outgoing=quantityOut===undefined?(['dispensing','pharmacy_sale','supplier_return','transfer_out','damaged','expired','write_off','out'].includes(type)?q:0):qty(quantityOut);
 const next=qty(previous+incoming-outgoing);
 if(next<0)throw Object.assign(new Error('Insufficient stock. Negative inventory is not permitted.'),{status:409});
 const updated=await MedicineBatch.findOneAndUpdate({_id:batch._id,tenantId,branchId,quantity:previous},{$set:{quantity:next}},{new:true,session});
 if(!updated)throw Object.assign(new Error('Stock changed concurrently. Refresh and retry.'),{status:409});
 const tx=await InventoryTransaction.create([{tenantId,branchId,medicineId,batchId,type,quantity:q,quantityIn:incoming,quantityOut:outgoing,previousBalance:previous,newBalance:next,sourceType,sourceId,reference:`${sourceType}:${sourceId}`,idempotencyKey,reason,performedBy:userId}],{session});
 return {batch:updated,transaction:tx[0],previous,next};
}
function pharmacyBillLine({description,quantity,unitPrice,tax,hsnSac}){
 const q=qty(quantity),price=money(unitPrice),rate=tax&&!tax.exempt?Number(tax.rate||0):0;
 const netUnit=tax?.inclusive&&rate>0?money(price/(1+rate/100)):price;
 const base=money(q*netUnit),gross=money(q*price);
 const taxAmount=rate>0?(tax.inclusive?money(gross-base):money(base*rate/100)):0;
 return {description,quantity:q,unitPrice:netUnit,taxRate:rate,taxType:tax?.taxType||'none',taxAmount,hsnSac:hsnSac||''};
}
async function createPharmacyInvoice({tenantId,branchId,patientId,sourceType,sourceId,items,userId,session}){
 const link=await BillingSourceLink.findOne({tenantId,sourceType,sourceId}).session(session);
 if(link)return Invoice.findOne({_id:link.invoiceId,tenantId}).session(session);
 const invoiceItems=items.map(i=>({sourceType,sourceId,description:i.description,category:'pharmacy',quantity:i.quantity,unitPrice:i.unitPrice,discount:0,taxRate:i.taxRate||0,taxType:i.taxType||'none',taxAmount:i.taxAmount||0,amount:money(i.quantity*i.unitPrice+(i.taxAmount||0)),hsnSac:i.hsnSac||''}));
 const subtotal=money(items.reduce((n,i)=>n+i.quantity*i.unitPrice,0));
 const tax=money(items.reduce((n,i)=>n+(i.taxAmount||0),0));
 const total=money(subtotal+tax);const cgst=money(items.filter(i=>i.taxType==='cgst_sgst').reduce((n,i)=>n+i.taxAmount/2,0));const sgst=money(items.filter(i=>i.taxType==='cgst_sgst').reduce((n,i)=>n+i.taxAmount-i.taxAmount/2,0));const igst=money(items.filter(i=>i.taxType==='igst').reduce((n,i)=>n+i.taxAmount,0));
 const invoiceNo=await nextNo(tenantId,'INV',session);
 const inv=await Invoice.create([{tenantId,branchId,patientId,invoiceNo,invoiceType:'pharmacy',status:'issued',items:invoiceItems,subtotal,discount:0,tax,cgst,sgst,igst,total,paid:0,issuedAt:new Date(),finalizedBy:userId,createdBy:userId,notes:`Created from ${sourceType} ${sourceId}`}],{session});
 await BillingSourceLink.create([{tenantId,branchId,sourceType,sourceId,patientId,invoiceId:inv[0]._id,createdBy:userId}],{session});
 const revenue=money(total-tax);
 const lines=[{code:'1100',debit:total},{code:'4100',credit:revenue}];
 if(tax>0)lines.push({code:'2100',credit:tax});
 await postPharmacyJournal({tenantId,branchId,sourceType:`${sourceType}_invoice`,sourceId:inv[0]._id,description:`Pharmacy invoice ${invoiceNo}`,lines,userId,session});
 return inv[0];
}
async function buildFefoPlan({tenantId,branchId,medicineId,quantity,requested,session}){
 const batches=await MedicineBatch.find({tenantId,branchId,medicineId,status:'active',quantity:{$gt:0},expiryDate:{$gt:new Date()}}).sort({expiryDate:1,createdAt:1,_id:1}).session(session||null).lean();
 let remaining=qty(quantity);const plan=[];
 for(const b of batches){if(remaining<=0)break;const take=qty(Math.min(remaining,Number(b.quantity||0)));if(take>0){plan.push({batchId:b._id,quantity:take,batchNo:b.batchNo,expiryDate:b.expiryDate});remaining=qty(remaining-take);}}
 if(remaining>0)throw Object.assign(new Error('Insufficient unexpired stock to fulfill the requested quantity'),{status:409});
 if(requested?.length){
  const normalized=requested.map(x=>({batchId:String(x.batchId),quantity:qty(x.quantity)}));
  if(normalized.length!==plan.length||normalized.some((x,i)=>x.batchId!==String(plan[i].batchId)||x.quantity!==plan[i].quantity))throw Object.assign(new Error('Select available batches in FEFO order (earliest expiry first)'),{status:409});
 }
 return plan;
}
function validateItems(items,max=100){
 if(!Array.isArray(items)||!items.length||items.length>max)return 'Add between 1 and '+max+' items';
 for(const i of items){if(!validId(i.medicineId))return 'Select a valid medicine';if(!Number.isFinite(Number(i.quantity))||Number(i.quantity)<=0)return 'Quantities must be greater than zero';}
 return null;
}
async function accessiblePatient(req,id){
 return Patient.findOne({_id:id,tenantId:req.tenantId,...(isAdmin(req)?{}:{branchId:{$in:req.branchIds}})});
}
router.get('/pharmacy/branches',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>res.json({success:true,data:await Branch.find({tenantId:req.tenantId,active:true,...(isAdmin(req)?{}:{_id:{$in:req.branchIds}})}).select('name code city state timezone').sort({name:1}).lean()})));
router.get('/pharmacy/patients',requirePermission('pharmacy.manage'),allowRoles('hospital_admin','branch_admin','pharmacist'),asyncHandler(async(req,res)=>{const q=clean(req.query.q,80),safeQ=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const data=await Patient.find({tenantId:req.tenantId,...branchFilter(req),active:true,...(q?{$or:[{firstName:{$regex:safeQ,$options:'i'}},{lastName:{$regex:safeQ,$options:'i'}},{uhid:{$regex:safeQ,$options:'i'}},{phone:{$regex:safeQ,$options:'i'}}]}:{})}).select('firstName lastName uhid phone branchId').sort({firstName:1}).limit(100).lean();res.json({success:true,data})}));
router.get('/pharmacy/dashboard',requirePermission('pharmacy.view'),asyncHandler(async(req,res)=>{
 const branchId=req.query.branchId;
 if(branchId&&!branchAllowed(req,branchId))return fail(res,'Branch access denied',403);
 const filter={tenantId:req.tenantId,...(branchId?{branchId}:branchFilter(req))};const aggFilter={tenantId:new mongoose.Types.ObjectId(req.tenantId),...(branchId?{branchId:new mongoose.Types.ObjectId(branchId)}:isAdmin(req)?{}:{branchId:{$in:req.branchIds.map(x=>new mongoose.Types.ObjectId(x))}})};
 const now=new Date(),today=new Date(now);today.setHours(0,0,0,0);
 const expiring=new Date(now);expiring.setDate(expiring.getDate()+Number(req.query.expiryDays||90));
 const [medicines,active,low,out,exp,expired,batches,dispensingToday,pendingRx,pendingPO,pendingGR,salesToday,salesMonth,recent,salesTrend,categoryMix,purchaseVsSales,movementTrend]=await Promise.all([
  Medicine.countDocuments({tenantId:req.tenantId}),Medicine.countDocuments({tenantId:req.tenantId,active:true}),
  Medicine.aggregate([{$match:{tenantId:new mongoose.Types.ObjectId(req.tenantId)}},{$lookup:{from:'medicinebatches',let:{mid:'$_id'},pipeline:[{$match:{tenantId:new mongoose.Types.ObjectId(req.tenantId),...(branchId?{branchId:new mongoose.Types.ObjectId(branchId)}:isAdmin(req)?{}:{branchId:{$in:req.branchIds.map(x=>new mongoose.Types.ObjectId(x))}})}},{$match:{$expr:{$eq:['$medicineId','$$mid']}}}],as:'batches'}},{$addFields:{stock:{$sum:'$batches.quantity'}}},{$match:{$expr:{$and:[{$gt:['$reorderLevel',0]},{$lte:['$stock','$reorderLevel']}]}}},{$count:'n'}]),
  MedicineBatch.countDocuments({...filter,quantity:0}),MedicineBatch.countDocuments({...filter,expiryDate:{$gt:now,$lte:expiring},status:'active'}),MedicineBatch.countDocuments({...filter,expiryDate:{$lte:now},quantity:{$gt:0}}),
  MedicineBatch.aggregate([{$match:aggFilter},{$group:{_id:null,units:{$sum:'$quantity'},value:{$sum:{$multiply:['$quantity','$purchasePrice']}}}}]),
  Dispensing.countDocuments({...filter,createdAt:{$gte:today},status:'completed'}),
  Prescription.countDocuments({tenantId:req.tenantId,...(branchId?{branchId}:branchFilter(req)),status:{$in:['finalized','partially_dispensed','amended']}}),
  PurchaseOrder.countDocuments({...filter,status:'submitted'}),
  PurchaseOrder.countDocuments({...filter,status:{$in:['approved','partially_received']}}),
  PharmacySale.countDocuments({...filter,createdAt:{$gte:today}}),
  PharmacySale.countDocuments({...filter,createdAt:{$gte:new Date(now.getFullYear(),now.getMonth(),1)}}),
  InventoryTransaction.find(filter).sort({createdAt:-1}).limit(12).populate('medicineId','name medicineCode').populate('performedBy','name').lean(),

  PharmacySale.aggregate([{$match:{...aggFilter,createdAt:{$gte:new Date(now.getFullYear(),now.getMonth()-5,1)}}},{$group:{_id:{$dateToString:{format:'%Y-%m',date:'$createdAt'}},revenue:{$sum:'$total'},count:{$sum:1}}},{$sort:{_id:1}}]),
  Medicine.aggregate([{$match:{tenantId:new mongoose.Types.ObjectId(req.tenantId)}},{$group:{_id:{$ifNull:['$category','Uncategorised']},count:{$sum:1}}},{$sort:{count:-1}}]),
  Promise.all([PurchaseOrder.aggregate([{$match:{...aggFilter,createdAt:{$gte:new Date(now.getFullYear(),now.getMonth()-5,1)}}},{$group:{_id:{$dateToString:{format:'%Y-%m',date:'$createdAt'}},purchases:{$sum:'$total'}}},{$sort:{_id:1}}]),PharmacySale.aggregate([{$match:{...aggFilter,createdAt:{$gte:new Date(now.getFullYear(),now.getMonth()-5,1)}}},{$group:{_id:{$dateToString:{format:'%Y-%m',date:'$createdAt'}},sales:{$sum:'$total'}}},{$sort:{_id:1}}])]),
  InventoryTransaction.aggregate([{$match:{...aggFilter,createdAt:{$gte:new Date(now.getFullYear(),now.getMonth()-5,1)}}},{$group:{_id:{$dateToString:{format:'%Y-%m',date:'$createdAt'}},in:{$sum:'$quantityIn'},out:{$sum:'$quantityOut'}}},{$sort:{_id:1}}])
 ]);
 res.json({success:true,data:{medicines,active,lowStock:low[0]?.n||0,outOfStock:out,expiring,expired,totalUnits:batches[0]?.units||0,stockValue:money(batches[0]?.value||0),dispensingToday,pendingPrescriptions:pendingRx,pendingPurchaseOrders:pendingPO,pendingGoodsReceipts:pendingGR,salesToday,salesMonth,recentMovements:recent,salesTrend,categoryMix,purchaseVsSales,movementTrend}});
}));
router.get('/pharmacy/medicines',requirePermission('pharmacy.view'),asyncHandler(async(req,res)=>{
 const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||25)),q=clean(req.query.q,100),safeQ=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const filter={tenantId:req.tenantId,...(req.query.active==='all'?{}:{active:true}),...(req.query.categoryId?{categoryId:req.query.categoryId}:{}),...(q?{$or:[{name:{$regex:q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),$options:'i'}},{genericName:{$regex:safeQ,$options:'i'}},{brandName:{$regex:safeQ,$options:'i'}},{composition:{$regex:safeQ,$options:'i'}},{strength:{$regex:safeQ,$options:'i'}},{medicineCode:{$regex:safeQ,$options:'i'}},{barcode:q}]}:{})};
 const medicineQuery=Medicine.find(filter).sort({name:1}).skip((page-1)*limit).limit(limit).populate('categoryId','name').populate('genericId','name');if(!req.permissions?.includes('pharmacy.manage')&&!isAdmin(req))medicineQuery.select('name genericName genericId brandName medicineCode category categoryId manufacturer composition strength dosageForm unit prescriptionRequired active');
 const [data,total]=await Promise.all([medicineQuery.lean(),Medicine.countDocuments(filter)]);
 res.json({success:true,data,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
}));
router.post('/pharmacy/medicines',requirePermission('pharmacy.manage'),allowRoles('hospital_admin','branch_admin','pharmacist'),audit('pharmacy.medicine.created','medicine'),asyncHandler(async(req,res)=>{
 const name=clean(req.body.name,180),medicineCode=clean(req.body.medicineCode,40).toUpperCase(),sellingPrice=money(req.body.sellingPrice||0),mrp=money(req.body.mrp||0);
 if(!name||!medicineCode)return fail(res,'Medicine name and code are required');if(mrp>0&&sellingPrice>mrp)return fail(res,'Selling price cannot exceed MRP',422);
 const doc=await Medicine.create({tenantId:req.tenantId,name,medicineCode,genericName:clean(req.body.genericName,180),brandName:clean(req.body.brandName,180),genericId:req.body.genericId||undefined,sku:clean(req.body.sku,60),barcode:clean(req.body.barcode,80),categoryId:req.body.categoryId||undefined,category:clean(req.body.category,80),manufacturer:clean(req.body.manufacturer,160),composition:clean(req.body.composition,500),strength:clean(req.body.strength,80),dosageForm:req.body.dosageForm||'other',unit:clean(req.body.unit||'unit',30),packSize:Number(req.body.packSize||1),purchasePrice:money(req.body.purchasePrice||0),sellingPrice,mrp,taxConfigurationId:req.body.taxConfigurationId||undefined,hsnCode:clean(req.body.hsnCode,30),reorderLevel:Number(req.body.reorderLevel||0),minimumStock:Number(req.body.minimumStock||0),storageInstructions:clean(req.body.storageInstructions,500),prescriptionRequired:!!req.body.prescriptionRequired,active:true,createdBy:req.user._id});
 res.status(201).json({success:true,data:doc});
}));
router.patch('/pharmacy/medicines/:id',requirePermission('pharmacy.manage'),allowRoles('hospital_admin','branch_admin','pharmacist'),audit('pharmacy.medicine.updated','medicine'),asyncHandler(async(req,res)=>{
 const doc=await Medicine.findOne({_id:req.params.id,tenantId:req.tenantId});if(!doc)return fail(res,'Medicine not found',404);
 const allowed=['name','genericName','brandName','genericId','sku','barcode','categoryId','category','manufacturer','composition','strength','dosageForm','unit','packSize','purchasePrice','sellingPrice','mrp','taxConfigurationId','hsnCode','reorderLevel','minimumStock','storageInstructions','prescriptionRequired','active'];
 for(const k of allowed)if(req.body[k]!==undefined)doc[k]=['purchasePrice','sellingPrice','mrp','packSize','reorderLevel','minimumStock'].includes(k)?Number(req.body[k]):req.body[k];
 if(Number(doc.mrp||0)>0&&Number(doc.sellingPrice||0)>Number(doc.mrp))return fail(res,'Selling price cannot exceed MRP',422);doc.updatedBy=req.user._id;await doc.save();res.json({success:true,data:doc});
}));
router.patch('/pharmacy/medicines/:id/branch-pricing',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>{
 const medicine=await Medicine.findOne({_id:req.params.id,tenantId:req.tenantId});if(!medicine)return fail(res,'Medicine not found',404);
 const branch=await branchDoc(req,req.body.branchId);if(!branch)return fail(res,'Branch access denied',403);
 const values={branchId:branch._id,purchasePrice:Number(req.body.purchasePrice||0),sellingPrice:Number(req.body.sellingPrice||0),mrp:Number(req.body.mrp||0)};
 if([values.purchasePrice,values.sellingPrice,values.mrp].some(x=>!Number.isFinite(x)||x<0))return fail(res,'Branch prices must be valid non-negative amounts');if(values.mrp>0&&values.sellingPrice>values.mrp)return fail(res,'Branch selling price cannot exceed MRP',422);
 const existing=medicine.branchPricing.find(x=>String(x.branchId)===String(branch._id));if(existing)Object.assign(existing,values);else medicine.branchPricing.push(values);
 medicine.updatedBy=req.user._id;await medicine.save();res.json({success:true,data:medicine.branchPricing});
}));
router.get('/pharmacy/categories',requirePermission('pharmacy.view'),asyncHandler(async(req,res)=>res.json({success:true,data:await MedicineCategory.find({tenantId:req.tenantId}).sort({name:1}).lean()})));
router.post('/pharmacy/categories',requirePermission('pharmacy.manage'),allowRoles('hospital_admin','branch_admin','pharmacist'),audit('pharmacy.category.created','medicine_category'),asyncHandler(async(req,res)=>{
 const name=clean(req.body.name,100),code=clean(req.body.code,30).toUpperCase();if(!name||!code)return fail(res,'Category name and code are required');
 const x=await MedicineCategory.create({tenantId:req.tenantId,name,code,description:clean(req.body.description,500),createdBy:req.user._id});res.status(201).json({success:true,data:x});
}));
router.patch('/pharmacy/categories/:id',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>{const x=await MedicineCategory.findOneAndUpdate({_id:req.params.id,tenantId:req.tenantId},{$set:{...(req.body.name?{name:clean(req.body.name,100)}:{}),...(req.body.description!==undefined?{description:clean(req.body.description,500)}:{}),...(req.body.active!==undefined?{active:!!req.body.active}:{})}},{new:true});if(!x)return fail(res,'Category not found',404);res.json({success:true,data:x})}));
router.get('/pharmacy/generics',requirePermission('pharmacy.view'),asyncHandler(async(req,res)=>res.json({success:true,data:await GenericMedicine.find({tenantId:req.tenantId,active:true}).sort({name:1}).lean()})));
router.post('/pharmacy/generics',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>{const name=clean(req.body.name,180);if(!name)return fail(res,'Generic name is required');const x=await GenericMedicine.create({tenantId:req.tenantId,name,composition:clean(req.body.composition,1000),description:clean(req.body.description,500),createdBy:req.user._id});res.status(201).json({success:true,data:x})}));
router.patch('/pharmacy/generics/:id',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>{const x=await GenericMedicine.findOneAndUpdate({_id:req.params.id,tenantId:req.tenantId},{$set:{...(req.body.name?{name:clean(req.body.name,180)}:{}),...(req.body.composition!==undefined?{composition:clean(req.body.composition,1000)}:{}),...(req.body.description!==undefined?{description:clean(req.body.description,500)}:{}),...(req.body.active!==undefined?{active:!!req.body.active}:{})}},{new:true});if(!x)return fail(res,'Generic medicine not found',404);res.json({success:true,data:x})}));
router.get('/pharmacy/suppliers',requirePermission('pharmacy.supplier.manage'),asyncHandler(async(req,res)=>{const q=Supplier.find({tenantId:req.tenantId,...(req.query.active==='all'?{}:{active:true})}).sort({name:1});if(!isAdmin(req))q.select('name supplierCode contactPerson phone email address gstin drugLicence paymentTerms active');res.json({success:true,data:await q.lean()})}));
router.post('/pharmacy/suppliers',requirePermission('pharmacy.supplier.manage'),allowRoles('hospital_admin','branch_admin','pharmacist'),audit('pharmacy.supplier.created','supplier'),asyncHandler(async(req,res)=>{const name=clean(req.body.name,180),supplierCode=clean(req.body.supplierCode,40).toUpperCase();if(!name||!supplierCode)return fail(res,'Supplier name and code are required');const x=await Supplier.create({tenantId:req.tenantId,name,supplierCode,contactPerson:clean(req.body.contactPerson,120),phone:clean(req.body.phone,30),email:clean(req.body.email,160),address:clean(req.body.address,500),gstin:clean(req.body.gstin,20),drugLicence:clean(req.body.drugLicence,100),paymentTerms:clean(req.body.paymentTerms,120),openingBalance:money(req.body.openingBalance||0),notes:clean(req.body.notes,1000),createdBy:req.user._id});res.status(201).json({success:true,data:x})}));
router.patch('/pharmacy/suppliers/:id',requirePermission('pharmacy.supplier.manage'),asyncHandler(async(req,res)=>{const x=await Supplier.findOneAndUpdate({_id:req.params.id,tenantId:req.tenantId},{$set:{name:clean(req.body.name,180),contactPerson:clean(req.body.contactPerson,120),phone:clean(req.body.phone,30),email:clean(req.body.email,160),address:clean(req.body.address,500),gstin:clean(req.body.gstin,20),drugLicence:clean(req.body.drugLicence,100),paymentTerms:clean(req.body.paymentTerms,120),notes:clean(req.body.notes,1000),...(req.body.active!==undefined?{active:!!req.body.active}:{})}},{new:true});if(!x)return fail(res,'Supplier not found',404);res.json({success:true,data:x})}));
router.get('/pharmacy/purchase-orders',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>res.json({success:true,data:await PurchaseOrder.find({tenantId:req.tenantId,...branchFilter(req),...(req.query.status?{status:req.query.status}:{})}).populate('supplierId','name supplierCode').populate('branchId','name').populate('items.medicineId','name medicineCode').sort({createdAt:-1}).limit(200).lean()})));
router.post('/pharmacy/purchase-orders',requirePermission('pharmacy.manage'),allowRoles('hospital_admin','branch_admin','pharmacist'),audit('pharmacy.purchase_order.created','purchase_order'),asyncHandler(async(req,res)=>{
 const err=validateItems(req.body.items);if(err)return fail(res,err);const branch=await branchDoc(req,req.body.branchId);if(!branch)return fail(res,'Branch access denied',403);const supplier=await Supplier.findOne({_id:req.body.supplierId,tenantId:req.tenantId,active:true});if(!supplier)return fail(res,'Active supplier not found',404);
 const ids=req.body.items.map(x=>x.medicineId);const meds=await Medicine.find({_id:{$in:ids},tenantId:req.tenantId,active:true});if(meds.length!==new Set(ids.map(String)).size)return fail(res,'One or more medicines are unavailable',422);
 const items=req.body.items.map(i=>{const m=meds.find(x=>String(x._id)===String(i.medicineId));const q=Number(i.quantity),branchPrice=m.branchPricing.find(x=>String(x.branchId)===String(branch._id)),price=money(i.unitPrice??branchPrice?.purchasePrice??m.purchasePrice),discount=money(i.discount||0),taxRate=Number(i.taxRate||0);if(price<0||discount<0||discount>q*price||taxRate<0||taxRate>100)throw Object.assign(new Error('Purchase line pricing is invalid'),{status:422});const base=money(q*price-discount);return {medicineId:m._id,medicineName:m.name,quantity:q,unitPrice:price,discount,taxRate,amount:money(base+base*taxRate/100)}});
 const subtotal=money(items.reduce((n,i)=>n+i.quantity*i.unitPrice-i.discount,0)),total=money(items.reduce((n,i)=>n+i.amount,0));
 const po=await PurchaseOrder.create({tenantId:req.tenantId,branchId:branch._id,supplierId:supplier._id,orderNo:await nextNo(req.tenantId,'PO'),items,subtotal,tax:money(total-subtotal),total,expectedAt:req.body.expectedAt||undefined,remarks:clean(req.body.remarks,1000),status:'draft',createdBy:req.user._id});
 res.status(201).json({success:true,data:po});
}));
router.patch('/pharmacy/purchase-orders/:id',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>{
 const po=await PurchaseOrder.findOne({_id:req.params.id,tenantId:req.tenantId,...branchFilter(req),status:'draft'});if(!po)return fail(res,'Draft purchase order not found',404);
 const supplier=await Supplier.findOne({_id:req.body.supplierId||po.supplierId,tenantId:req.tenantId,active:true});if(!supplier)return fail(res,'Active supplier not found',404);
 const err=validateItems(req.body.items);if(err)return fail(res,err);
 const ids=req.body.items.map(x=>x.medicineId),meds=await Medicine.find({_id:{$in:ids},tenantId:req.tenantId,active:true});if(meds.length!==new Set(ids.map(String)).size)return fail(res,'One or more medicines are unavailable',422);
 const items=req.body.items.map(i=>{const m=meds.find(x=>String(x._id)===String(i.medicineId)),q=Number(i.quantity),branchPrice=m.branchPricing.find(x=>String(x.branchId)===String(po.branchId)),price=money(i.unitPrice??branchPrice?.purchasePrice??m.purchasePrice),discount=money(i.discount||0),taxRate=Number(i.taxRate||0);if(price<0||discount<0||discount>q*price||taxRate<0||taxRate>100)throw Object.assign(new Error('Purchase line pricing is invalid'),{status:422});const base=money(q*price-discount);return {medicineId:m._id,medicineName:m.name,quantity:q,receivedQuantity:0,unitPrice:price,discount,taxRate,amount:money(base+base*taxRate/100)};});
 const subtotal=money(items.reduce((n,i)=>n+i.quantity*i.unitPrice-i.discount,0)),total=money(items.reduce((n,i)=>n+i.amount,0));
 po.supplierId=supplier._id;po.items=items;po.subtotal=subtotal;po.tax=money(total-subtotal);po.total=total;po.expectedAt=req.body.expectedAt||undefined;po.remarks=clean(req.body.remarks,1000);await po.save();res.json({success:true,data:po});
}));
router.patch('/pharmacy/purchase-orders/:id/submit',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>{const po=await PurchaseOrder.findOne({_id:req.params.id,tenantId:req.tenantId,...branchFilter(req),status:'draft'});if(!po)return fail(res,'Draft purchase order not found',404);po.status='submitted';po.submittedAt=new Date();await po.save();res.json({success:true,data:po})}));
router.patch('/pharmacy/purchase-orders/:id/approve',requirePermission('pharmacy.purchase.approve'),allowRoles('hospital_admin','branch_admin'),audit('pharmacy.purchase_order.approved','purchase_order'),asyncHandler(async(req,res)=>{const po=await PurchaseOrder.findOne({_id:req.params.id,tenantId:req.tenantId,...branchFilter(req),status:'submitted'});if(!po)return fail(res,'Submitted purchase order not found',404);po.status='approved';po.approvedAt=new Date();po.approvedBy=req.user._id;await po.save();res.json({success:true,data:po})}));
router.get('/pharmacy/goods-receipts',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>res.json({success:true,data:await GoodsReceipt.find({tenantId:req.tenantId,...branchFilter(req)}).populate('supplierId','name').populate('purchaseOrderId','orderNo').sort({createdAt:-1}).limit(200).lean()})));
router.post('/pharmacy/goods-receipts',requirePermission('pharmacy.manage'),allowRoles('hospital_admin','branch_admin','pharmacist'),audit('pharmacy.goods_receipt.accepted','goods_receipt'),asyncHandler(async(req,res)=>{
 const key=clean(req.headers['idempotency-key']||req.body.idempotencyKey,120);if(!key)return fail(res,'Idempotency-Key is required');
 const existing=await GoodsReceipt.findOne({tenantId:req.tenantId,idempotencyKey:key});if(existing)return res.json({success:true,data:existing,replayed:true});if(!Array.isArray(req.body.items)||!req.body.items.length)return fail(res,'Add at least one received purchase order line');
 const session=await mongoose.startSession();let result;
 try{await session.withTransaction(async()=>{
  const po=await PurchaseOrder.findOne({_id:req.body.purchaseOrderId,tenantId:req.tenantId,...branchFilter(req),status:{$in:['approved','partially_received']}}).session(session);
  if(!po)throw Object.assign(new Error('Approved purchase order not found'),{status:404});
  const receiptId=new mongoose.Types.ObjectId();const items=[];let acceptedTotal=0,acceptedTax=0;
  for(const line of req.body.items||[]){
   const poItem=po.items.id(line.purchaseOrderItemId);if(!poItem)throw Object.assign(new Error('Purchase order item not found'),{status:404});
   const received=qty(line.receivedQuantity),rejected=qty(line.rejectedQuantity||0),damaged=qty(line.damagedQuantity||0),total=qty(received+rejected+damaged);
   const pending=qty(poItem.quantity-poItem.receivedQuantity);if(total<=0||total>pending)throw Object.assign(new Error('Receipt quantity exceeds pending purchase quantity'),{status:409});const medicine=await Medicine.findOne({_id:poItem.medicineId,tenantId:req.tenantId,active:true}).session(session);if(!medicine)throw Object.assign(new Error('Medicine is no longer active'),{status:409});const branchPrice=medicine.branchPricing.find(x=>String(x.branchId)===String(po.branchId));const purchasePrice=Number(line.purchasePrice??poItem.unitPrice),sellingPrice=Number(line.sellingPrice||branchPrice?.sellingPrice||medicine.sellingPrice||0),mrp=Number(line.mrp||branchPrice?.mrp||medicine.mrp||sellingPrice),taxRate=Number(line.taxRate??poItem.taxRate??0);
   if(mrp>0&&sellingPrice>mrp)throw Object.assign(new Error('Selling price cannot exceed MRP'),{status:422});const expiry=new Date(line.expiryDate);if(!Number.isFinite(expiry.getTime())||expiry<=new Date())throw Object.assign(new Error('Batch expiry must be a future date'),{status:422});
   if(received>0){
    let batch=await MedicineBatch.findOne({tenantId:req.tenantId,branchId:po.branchId,medicineId:poItem.medicineId,batchNo:clean(line.batchNo,80)}).session(session);
    if(batch){
     if(String(batch.expiryDate)!==String(expiry))throw Object.assign(new Error('Existing batch number has a different expiry date'),{status:409});if(batch.supplierId&&String(batch.supplierId)!==String(po.supplierId))throw Object.assign(new Error('Batch number is already linked to another supplier'),{status:409});if(Number(batch.purchasePrice||0)>0&&Math.abs(Number(batch.purchasePrice)-purchasePrice)>0.01)throw Object.assign(new Error('Batch purchase cost differs from the existing batch cost; receive as a separately tracked lot'),{status:409});
     const previous=qty(batch.quantity),next=qty(previous+received);
     batch=await MedicineBatch.findOneAndUpdate({_id:batch._id,tenantId:req.tenantId,quantity:previous},{$inc:{quantity:received,receivedQuantity:received},$set:{supplierId:po.supplierId,goodsReceiptId:receiptId,purchasePrice:purchasePrice,sellingPrice:sellingPrice,mrp:mrp,manufacturedAt:line.manufacturedAt||undefined,status:'active'}},{new:true,session});
     if(!batch)throw Object.assign(new Error('Batch stock changed concurrently'),{status:409});
     const tx=await InventoryTransaction.create([{tenantId:req.tenantId,branchId:po.branchId,medicineId:poItem.medicineId,batchId:batch._id,type:'purchase_receipt',quantity:received,quantityIn:received,quantityOut:0,previousBalance:previous,newBalance:next,sourceType:'goods_receipt',sourceId:receiptId,reason:'Goods receipt',performedBy:req.user._id}],{session});
     acceptedTotal+=money(received*purchasePrice);acceptedTax+=money(received*purchasePrice*taxRate/100);
    }else{
     batch=(await MedicineBatch.create([{tenantId:req.tenantId,branchId:po.branchId,medicineId:poItem.medicineId,batchNo:clean(line.batchNo,80),expiryDate:expiry,quantity:received,receivedQuantity:received,goodsReceiptId:receiptId,purchasePrice:purchasePrice,sellingPrice:sellingPrice,mrp:mrp,supplierId:po.supplierId,manufacturedAt:line.manufacturedAt||undefined,status:'active'}],{session}))[0];
     await InventoryTransaction.create([{tenantId:req.tenantId,branchId:po.branchId,medicineId:poItem.medicineId,batchId:batch._id,type:'purchase_receipt',quantity:received,quantityIn:received,quantityOut:0,previousBalance:0,newBalance:received,sourceType:'goods_receipt',sourceId:receiptId,reason:'Goods receipt',performedBy:req.user._id}],{session});
     acceptedTotal+=money(received*purchasePrice);acceptedTax+=money(received*purchasePrice*taxRate/100);
    }
   }
   poItem.receivedQuantity=qty(poItem.receivedQuantity+total);
   items.push({purchaseOrderItemId:poItem._id,medicineId:poItem.medicineId,batchNo:clean(line.batchNo,80),manufacturedAt:line.manufacturedAt||undefined,expiryDate:expiry,receivedQuantity:received,rejectedQuantity:rejected,damagedQuantity:damaged,purchasePrice:purchasePrice,sellingPrice:sellingPrice,mrp:mrp,taxRate:taxRate});
  }
  const all=po.items.every(i=>i.receivedQuantity>=i.quantity);po.status=all?'received':'partially_received';await po.save({session});
  const receipt=(await GoodsReceipt.create([{_id:receiptId,tenantId:req.tenantId,branchId:po.branchId,purchaseOrderId:po._id,supplierId:po.supplierId,receiptNo:await nextNo(req.tenantId,'GRN',session),supplierInvoiceNo:clean(req.body.supplierInvoiceNo,100),items,status:'accepted',receivedBy:req.user._id,acceptedAt:new Date(),idempotencyKey:key}],{session}))[0];
  if(acceptedTotal>0)await postPharmacyJournal({tenantId:req.tenantId,branchId:po.branchId,sourceType:'goods_receipt',sourceId:receipt._id,description:`Goods receipt ${receipt.receiptNo}`,lines:[{code:'1200',debit:acceptedTotal},{code:'1300',debit:acceptedTax},{code:'2000',credit:money(acceptedTotal+acceptedTax)}],userId:req.user._id,session});
  result=receipt;
 });}catch(e){if(e.code===11000){result=await GoodsReceipt.findOne({tenantId:req.tenantId,idempotencyKey:key});if(result)return res.json({success:true,data:result,replayed:true});}return fail(res,e.message,e.status||409)}finally{await session.endSession()}
 res.status(201).json({success:true,data:result});
}));
router.get('/pharmacy/inventory',requirePermission('pharmacy.view'),asyncHandler(async(req,res)=>{
 if(req.query.branchId&&!branchAllowed(req,req.query.branchId))return fail(res,'Branch access denied',403);
 const filter={tenantId:req.tenantId,...(req.query.branchId?{branchId:req.query.branchId}:branchFilter(req)),...(req.query.medicineId?{medicineId:req.query.medicineId}:{})};
 const batchQuery=MedicineBatch.find(filter).populate('medicineId','name medicineCode genericName strength unit reorderLevel').populate('branchId','name').sort({expiryDate:1}).limit(500);if(!req.permissions?.includes('pharmacy.manage')&&!isAdmin(req))batchQuery.select('tenantId branchId medicineId batchNo expiryDate quantity status');else batchQuery.populate('supplierId','name');
 const batches=await batchQuery.lean();
 res.json({success:true,data:batches});
}));
router.get('/pharmacy/ledger',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>{
 if(req.query.branchId&&!branchAllowed(req,req.query.branchId))return fail(res,'Branch access denied',403);
 const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));
 const filter={tenantId:req.tenantId,...(req.query.branchId?{branchId:req.query.branchId}:branchFilter(req)),...(req.query.medicineId?{medicineId:req.query.medicineId}:{}),...(req.query.type?{type:req.query.type}:{})};
 const [data,total]=await Promise.all([InventoryTransaction.find(filter).populate('medicineId','name medicineCode').populate('batchId','batchNo expiryDate').populate('performedBy','name').sort({createdAt:-1}).skip((page-1)*limit).limit(limit).lean(),InventoryTransaction.countDocuments(filter)]);
 res.json({success:true,data,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
}));
router.get('/pharmacy/prescriptions/pending',requirePermission('pharmacy.view'),allowRoles('hospital_admin','branch_admin','pharmacist'),asyncHandler(async(req,res)=>{
 const data=await Prescription.find({tenantId:req.tenantId,...branchFilter(req),status:{$in:['finalized','partially_dispensed','amended']}}).populate('patientId','firstName lastName uhid phone').populate('doctorId','name specialty').sort({finalizedAt:1,createdAt:1}).limit(200).lean();
 res.json({success:true,data});
}));
router.get('/pharmacy/prescriptions/:id/availability',requirePermission('pharmacy.view'),allowRoles('hospital_admin','branch_admin','pharmacist'),asyncHandler(async(req,res)=>{
 const rx=await Prescription.findOne({_id:req.params.id,tenantId:req.tenantId,...branchFilter(req),status:{$in:['finalized','partially_dispensed','amended']}}).populate('patientId','firstName lastName uhid').lean();if(!rx)return fail(res,'Active finalized prescription not found',404);
 const branchId=String(rx.branchId);const results=[];
 for(const item of rx.items){const remaining=Math.max(0,Number(item.quantity||0)-Number(item.dispensedQuantity||0));if(!item.medicineId){results.push({prescriptionItemId:item._id,medicine:item.medicine,remaining,unmapped:true,batches:[]});continue;}
  const batches=await MedicineBatch.find({tenantId:req.tenantId,branchId,medicineId:item.medicineId,status:'active',quantity:{$gt:0},expiryDate:{$gt:new Date()}}).sort({expiryDate:1,createdAt:1}).lean();
  results.push({prescriptionItemId:item._id,medicineId:item.medicineId,medicine:item.medicine,remaining,unmapped:false,batches:batches.map(b=>({_id:b._id,batchNo:b.batchNo,expiryDate:b.expiryDate,availableQuantity:b.quantity,sellingPrice:b.sellingPrice,mrp:b.mrp}))});
 }
 res.json({success:true,data:{prescription:rx,items:results}});
}));
router.get('/pharmacy/doctor/dispensings',requirePermission('pharmacy.view'),allowRoles('doctor'),asyncHandler(async(req,res)=>{const doctor=await Doctor.findOne({tenantId:req.tenantId,userId:req.user._id,branchIds:{$in:req.branchIds}}).select('_id');if(!doctor)return fail(res,'Doctor profile not found',404);const data=await Dispensing.find({tenantId:req.tenantId,doctorId:doctor._id,...branchFilter(req)}).populate('patientId','firstName lastName uhid').populate('prescriptionId','prescriptionNo').populate('pharmacistId','name').populate('invoiceId','invoiceNo total').sort({createdAt:-1}).limit(200).lean();res.json({success:true,data})}));
router.get('/pharmacy/prescriptions/:id/dispensing-history',requirePermission('pharmacy.view'),allowRoles('doctor','hospital_admin','branch_admin'),asyncHandler(async(req,res)=>{const rx=await Prescription.findOne({_id:req.params.id,tenantId:req.tenantId,...branchFilter(req)});if(!rx)return fail(res,'Prescription not found',404);if(req.user.role==='doctor'){const doctor=await Doctor.findOne({tenantId:req.tenantId,userId:req.user._id}).select('_id');if(!doctor||String(rx.doctorId)!==String(doctor._id))return fail(res,'Prescription access denied',403);}const data=await Dispensing.find({tenantId:req.tenantId,prescriptionId:rx._id}).populate('pharmacistId','name').sort({createdAt:-1}).lean();res.json({success:true,data})}));
router.post('/pharmacy/dispensings/:id/reverse',requirePermission('pharmacy.stock.adjust.approve'),allowRoles('hospital_admin','branch_admin'),audit('pharmacy.dispensing.reversed','dispensing'),asyncHandler(async(req,res)=>{
 const reason=clean(req.body.reason,800);if(reason.length<8)return fail(res,'A documented reversal reason is required');
 const session=await mongoose.startSession();let reversal;
 try{await session.withTransaction(async()=>{
  const disp=await Dispensing.findOne({_id:req.params.id,tenantId:req.tenantId,...branchFilter(req),status:'completed'}).session(session);if(!disp)throw Object.assign(new Error('Completed dispensing not found or already reversed'),{status:404});
  if(await DispensingReversal.exists({tenantId:req.tenantId,dispensingId:disp._id}).session(session))throw Object.assign(new Error('This dispensing already has a reversal record'),{status:409});if(disp.items.some(i=>(i.batchAllocations||[]).some(a=>Number(a.returnedQuantity||0)>0)))throw Object.assign(new Error('Dispensing cannot be reversed while a customer return is pending or has been processed'),{status:409});
  const rx=await Prescription.findOne({_id:disp.prescriptionId,tenantId:req.tenantId,branchId:disp.branchId}).session(session);if(!rx)throw Object.assign(new Error('Original prescription not found'),{status:404});
  const reversalId=new mongoose.Types.ObjectId(),lines=[];
  for(const it of disp.items){
   const rxItem=rx.items.id(it.prescriptionItemId);if(!rxItem||Number(rxItem.dispensedQuantity||0)<Number(it.quantity))throw Object.assign(new Error('Prescription dispensing totals no longer match this record'),{status:409});
   rxItem.dispensedQuantity=qty(Number(rxItem.dispensedQuantity||0)-Number(it.quantity));
   for(const part of it.batchAllocations){
    const batch=await MedicineBatch.findOne({_id:part.batchId,tenantId:req.tenantId,branchId:disp.branchId}).session(session);if(!batch)throw Object.assign(new Error('Original batch not found'),{status:409});
    await addStockLedger({tenantId:req.tenantId,branchId:disp.branchId,medicineId:it.medicineId,batchId:batch._id,type:'reversal',quantity:part.quantity,quantityIn:part.quantity,quantityOut:0,sourceType:'dispensing_reversal',sourceId:reversalId,userId:req.user._id,session,reason});
    await MedicineBatch.updateOne({_id:batch._id,tenantId:req.tenantId},{$set:{status:'quarantine'}},{session});
    lines.push({dispensingItemId:it._id,batchId:batch._id,quantity:part.quantity});
   }
  }
  rx.status=rx.items.every(i=>Number(i.dispensedQuantity||0)>=Number(i.quantity||0))?'dispensed':rx.items.some(i=>Number(i.dispensedQuantity||0)>0)?'partially_dispensed':'finalized';await rx.save({session});
  reversal=(await DispensingReversal.create([{_id:reversalId,tenantId:req.tenantId,branchId:disp.branchId,dispensingId:disp._id,reversalNo:await nextNo(req.tenantId,'DREV',session),reason,items:lines,reversedBy:req.user._id}],{session}))[0];
  disp.status='reversed';await disp.save({session});
  if(disp.invoiceId){
   const invoice=await Invoice.findOne({_id:disp.invoiceId,tenantId:req.tenantId,branchId:disp.branchId}).session(session);
   if(invoice){const amount=money(Math.max(0,invoice.total-Number(invoice.creditNoteTotal||0)));if(amount>0){const cn=(await CreditNote.create([{tenantId:req.tenantId,branchId:disp.branchId,invoiceId:invoice._id,patientId:disp.patientId,creditNoteNo:await nextNo(req.tenantId,'CN',session),amount,reason:`Dispensing reversal ${reversal.reversalNo}: ${reason}`,status:'issued',issuedBy:req.user._id}],{session}))[0];invoice.creditNoteTotal=money(Number(invoice.creditNoteTotal||0)+amount);await invoice.save({session});reversal.creditNoteId=cn._id;await reversal.save({session});const tax=money(amount*(Number(invoice.total)>0?Number(invoice.tax||0)/Number(invoice.total):0)),base=money(amount-tax);await postPharmacyJournal({tenantId:req.tenantId,branchId:disp.branchId,sourceType:'pharmacy_dispensing_reversal',sourceId:reversal._id,description:`Dispensing reversal ${reversal.reversalNo}`,lines:[{code:'4100',debit:base},{code:'2100',debit:tax},{code:'1100',credit:amount}],userId:req.user._id,session});}}
  }
 });}catch(e){return fail(res,e.message,e.status||409)}finally{await session.endSession()}
 res.json({success:true,data:reversal,message:'Dispensing reversed. Returned stock has been quarantined; release it only after a separate authorized quality assessment.'});
}));
router.get('/pharmacy/dispensings',requirePermission('pharmacy.view'),allowRoles('hospital_admin','branch_admin','pharmacist'),asyncHandler(async(req,res)=>{
 const filter={tenantId:req.tenantId,...branchFilter(req),...(req.query.prescriptionId?{prescriptionId:req.query.prescriptionId}:{})};
 const data=await Dispensing.find(filter).populate('patientId','firstName lastName uhid').populate('prescriptionId','prescriptionNo').populate('pharmacistId','name').populate('invoiceId','invoiceNo total').sort({createdAt:-1}).limit(200).lean();res.json({success:true,data});
}));
router.post('/pharmacy/prescriptions/:id/dispense',requirePermission('pharmacy.manage'),allowRoles('hospital_admin','branch_admin','pharmacist'),audit('pharmacy.prescription.dispensed','dispensing'),asyncHandler(async(req,res)=>{
 const key=clean(req.headers['idempotency-key']||req.body.idempotencyKey,120);if(!key)return fail(res,'Idempotency-Key is required');
 const replay=await Dispensing.findOne({tenantId:req.tenantId,idempotencyKey:key});if(replay)return res.json({success:true,data:replay,replayed:true});
 if(!Array.isArray(req.body.items)||!req.body.items.length)return fail(res,'Select medicines and quantities to dispense');
 const session=await mongoose.startSession();let result;
 try{await session.withTransaction(async()=>{
  const rx=await Prescription.findOne({_id:req.params.id,tenantId:req.tenantId,...branchFilter(req),status:{$in:['finalized','partially_dispensed','amended']}}).session(session);
  if(!rx)throw Object.assign(new Error('Prescription is not eligible for dispensing'),{status:409});
  if(!rx.branchId)throw Object.assign(new Error('Prescription is missing a branch assignment'),{status:422});
  const patient=await Patient.findOne({_id:rx.patientId,tenantId:req.tenantId,branchId:rx.branchId}).session(session);if(!patient)throw Object.assign(new Error('Patient/branch relationship is invalid'),{status:409});
  const dispensingId=new mongoose.Types.ObjectId();const dispensingItems=[];let total=0;
  for(const line of req.body.items){
   const rxItem=rx.items.id(line.prescriptionItemId);if(!rxItem)throw Object.assign(new Error('Prescription item not found'),{status:404});
   if(!rxItem.medicineId)throw Object.assign(new Error(`Map prescribed medicine "${rxItem.medicine}" to a catalogue medicine before dispensing`),{status:422});
   const amount=qty(line.quantity),remaining=qty(Number(rxItem.quantity||0)-Number(rxItem.dispensedQuantity||0));
   if(amount<=0||amount>remaining)throw Object.assign(new Error('Dispensing quantity exceeds the authorized remaining prescription quantity'),{status:409});
   const medicine=await Medicine.findOne({_id:rxItem.medicineId,tenantId:req.tenantId,active:true}).session(session);if(!medicine)throw Object.assign(new Error('Prescribed medicine is inactive or unavailable'),{status:409});
   const plan=await buildFefoPlan({tenantId:req.tenantId,branchId:rx.branchId,medicineId:medicine._id,quantity:amount,requested:line.batches,session});
   const branchPrice=medicine.branchPricing.find(x=>String(x.branchId)===String(rx.branchId));const alloc=[];let lineValue=0;
   for(const part of plan){
    const batch=await MedicineBatch.findOne({_id:part.batchId,tenantId:req.tenantId,branchId:rx.branchId,medicineId:medicine._id,status:'active',expiryDate:{$gt:new Date()}}).session(session);
    if(!batch)throw Object.assign(new Error('Selected batch is expired, blocked or not in this branch'),{status:409});
    const n=qty(part.quantity);if(n<=0)throw Object.assign(new Error('Batch quantity must be greater than zero'),{status:422});
    const movement=await addStockLedger({tenantId:req.tenantId,branchId:rx.branchId,medicineId:medicine._id,batchId:batch._id,type:'dispensing',quantity:n,sourceType:'dispensing',sourceId:dispensingId,userId:req.user._id,session,reason:`Prescription ${rx.prescriptionNo||rx._id}`});
    alloc.push({batchId:batch._id,batchNo:batch.batchNo,quantity:n,expiryDate:batch.expiryDate});
    const actualPrice=Number(branchPrice?.sellingPrice||batch.sellingPrice||medicine.sellingPrice||0),actualMrp=Number(branchPrice?.mrp||batch.mrp||medicine.mrp||0);if(actualMrp>0&&actualPrice>actualMrp)throw Object.assign(new Error('Configured selling price exceeds batch MRP'),{status:422});lineValue+=money(n*actualPrice);
   }
   rxItem.dispensedQuantity=qty(Number(rxItem.dispensedQuantity||0)+amount);
   total+=lineValue;
   dispensingItems.push({prescriptionItemId:rxItem._id,medicineId:medicine._id,medicineName:medicine.name,quantity:amount,unitPrice:money(lineValue/amount),batchAllocations:alloc});
  }
  rx.status=rx.items.every(i=>Number(i.dispensedQuantity||0)>=Number(i.quantity||0))?'dispensed':'partially_dispensed';await rx.save({session});
  const disp=(await Dispensing.create([{_id:dispensingId,tenantId:req.tenantId,branchId:rx.branchId,prescriptionId:rx._id,patientId:rx.patientId,doctorId:rx.doctorId,dispensingNo:await nextNo(req.tenantId,'DSP',session),items:dispensingItems,total:money(total),status:'completed',idempotencyKey:key,pharmacistId:req.user._id,remarks:clean(req.body.remarks,1000)}],{session}))[0];
  const billItems=[];
  for(const it of dispensingItems){
   const med=await Medicine.findOne({_id:it.medicineId,tenantId:req.tenantId}).session(session);
   const tax=med.taxConfigurationId?await TaxConfiguration.findOne({_id:med.taxConfigurationId,tenantId:req.tenantId,active:true,$or:[{branchId:null},{branchId:rx.branchId}]}).session(session):null;
   billItems.push(pharmacyBillLine({description:it.medicineName,quantity:it.quantity,unitPrice:it.unitPrice,tax,hsnSac:med.hsnCode}));
  }
  const invoice=await createPharmacyInvoice({tenantId:req.tenantId,branchId:rx.branchId,patientId:rx.patientId,sourceType:'pharmacy_dispensing',sourceId:disp._id,items:billItems,userId:req.user._id,session});
  disp.invoiceId=invoice?._id;await disp.save({session});result=disp;
 });}catch(e){if(e.code===11000){result=await Dispensing.findOne({tenantId:req.tenantId,idempotencyKey:key});if(result)return res.json({success:true,data:result,replayed:true});}return fail(res,e.message,e.status||409)}finally{await session.endSession()}
 const saved=await Dispensing.findById(result._id).populate('patientId','firstName lastName uhid').populate('invoiceId','invoiceNo total').lean();
 await notifyPatient({tenantId:req.tenantId,patientId:saved.patientId._id,branchId:saved.branchId,category:'prescription',title:'Prescription dispensed',message:'Your prescription has been dispensed. View your pharmacy billing details in the patient portal.',link:'/my-billing'}).catch(()=>{});
 res.status(201).json({success:true,data:saved});
}));
router.post('/pharmacy/sales',requirePermission('pharmacy.manage'),allowRoles('hospital_admin','branch_admin','pharmacist'),audit('pharmacy.sale.created','pharmacy_sale'),asyncHandler(async(req,res)=>{
 const key=clean(req.headers['idempotency-key']||req.body.idempotencyKey,120);if(!key)return fail(res,'Idempotency-Key is required');
 const existing=await PharmacySale.findOne({tenantId:req.tenantId,idempotencyKey:key});if(existing)return res.json({success:true,data:existing,replayed:true});
 const err=validateItems(req.body.items);if(err)return fail(res,err);const patient=await accessiblePatient(req,req.body.patientId);if(!patient)return fail(res,'Patient not found in accessible branch',404);const branchId=req.body.branchId||patient.branchId;if(!branchAllowed(req,branchId)||String(patient.branchId)!==String(branchId))return fail(res,'Branch access denied',403);
 const session=await mongoose.startSession();let sale;
 try{await session.withTransaction(async()=>{
  const saleId=new mongoose.Types.ObjectId();const items=[];let total=0;const invoiceLines=[];
  const salePrescription=req.body.prescriptionId?await Prescription.findOne({_id:req.body.prescriptionId,tenantId:req.tenantId,patientId:patient._id,branchId,status:{$in:['finalized','partially_dispensed','amended']}}).session(session):null;
  if(req.body.prescriptionId&&!salePrescription)throw Object.assign(new Error('Valid finalized prescription for this patient and branch is required'),{status:422});
  for(const line of req.body.items){
   const med=await Medicine.findOne({_id:line.medicineId,tenantId:req.tenantId,active:true}).session(session);if(!med)throw Object.assign(new Error('Medicine unavailable'),{status:404});
   if(med.prescriptionRequired){
    if(!salePrescription)throw Object.assign(new Error(`${med.name} requires a valid prescription`),{status:422});
    const prescribed=salePrescription.items.find(i=>String(i.medicineId||'')===String(med._id));
    if(!prescribed||Number(prescribed.dispensedQuantity||0)+Number(line.quantity)>Number(prescribed.quantity||0))throw Object.assign(new Error(`${med.name} exceeds the authorized prescription quantity`),{status:409});
    prescribed.dispensedQuantity=qty(Number(prescribed.dispensedQuantity||0)+Number(line.quantity));
   }
   const allocations=[];let amount=0;
   const plan=await buildFefoPlan({tenantId:req.tenantId,branchId,medicineId:med._id,quantity:Number(line.quantity),requested:line.batches,session});
   for(const part of plan){
    const n=qty(part.quantity);const movement=await addStockLedger({tenantId:req.tenantId,branchId,medicineId:med._id,batchId:part.batchId,type:'pharmacy_sale',quantity:n,sourceType:'pharmacy_sale',sourceId:saleId,userId:req.user._id,session,reason:'Pharmacy counter sale'});
    allocations.push({batchId:movement.batch._id,quantity:n});const branchPrice=med.branchPricing.find(x=>String(x.branchId)===String(branchId)),actualPrice=Number(branchPrice?.sellingPrice||movement.batch.sellingPrice||med.sellingPrice||0),actualMrp=Number(branchPrice?.mrp||movement.batch.mrp||med.mrp||0);if(actualMrp>0&&actualPrice>actualMrp)throw Object.assign(new Error('Configured selling price exceeds batch MRP'),{status:422});amount+=money(n*actualPrice);
   }
   const totalQty=qty(allocations.reduce((n,x)=>n+x.quantity,0));
   const unitPrice=money(amount/totalQty);items.push({medicineId:med._id,medicineName:med.name,quantity:totalQty,unitPrice,batchAllocations:allocations});total+=amount;
   const tax=med.taxConfigurationId?await TaxConfiguration.findOne({_id:med.taxConfigurationId,tenantId:req.tenantId,active:true,$or:[{branchId:null},{branchId}]}).session(session):null;
   invoiceLines.push(pharmacyBillLine({description:med.name,quantity:totalQty,unitPrice,tax,hsnSac:med.hsnCode}));
  }
  const doc=(await PharmacySale.create([{_id:saleId,tenantId:req.tenantId,branchId,patientId:patient._id,saleNo:await nextNo(req.tenantId,'SALE',session),items,total:money(total),idempotencyKey:key,soldBy:req.user._id}],{session}))[0];
  const invoice=await createPharmacyInvoice({tenantId:req.tenantId,branchId,patientId:patient._id,sourceType:'pharmacy_sale',sourceId:doc._id,items:invoiceLines,userId:req.user._id,session});doc.invoiceId=invoice._id;await doc.save({session});if(salePrescription){salePrescription.status=salePrescription.items.every(i=>Number(i.dispensedQuantity||0)>=Number(i.quantity||0))?'dispensed':'partially_dispensed';await salePrescription.save({session});}sale=doc;
 });}catch(e){if(e.code===11000){sale=await PharmacySale.findOne({tenantId:req.tenantId,idempotencyKey:key});if(sale)return res.json({success:true,data:sale,replayed:true});}return fail(res,e.message,e.status||409)}finally{await session.endSession()}
 res.status(201).json({success:true,data:await PharmacySale.findById(sale._id).populate('invoiceId','invoiceNo total').lean()});
}));
router.get('/pharmacy/sales',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>res.json({success:true,data:await PharmacySale.find({tenantId:req.tenantId,...branchFilter(req)}).populate('patientId','firstName lastName uhid').populate('invoiceId','invoiceNo total paid status').sort({createdAt:-1}).limit(200).lean()})));
router.post('/pharmacy/transfers',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>{
 const {sourceBranchId,destinationBranchId,items}=req.body;if(String(sourceBranchId)===String(destinationBranchId))return fail(res,'Select two different branches',422);
 const [sourceBranch,destinationBranch]=await Promise.all([branchDoc(req,sourceBranchId),branchDoc(req,destinationBranchId)]);if(!sourceBranch||!destinationBranch)return fail(res,'Both branches must belong to this organization and be accessible',403);
 const err=validateItems(items);if(err)return fail(res,err);
 const rows=[];for(const i of items){if(!validId(i.batchId))return fail(res,'Select a valid source batch');const b=await MedicineBatch.findOne({_id:i.batchId,tenantId:req.tenantId,branchId:sourceBranchId,medicineId:i.medicineId,status:'active',expiryDate:{$gt:new Date()},quantity:{$gte:Number(i.quantity)}});if(!b)return fail(res,'Source batch unavailable or insufficient',409);rows.push({medicineId:i.medicineId,batchId:b._id,batchNo:b.batchNo,quantity:qty(i.quantity),receivedQuantity:0,damagedQuantity:0});}
 const x=await StockTransfer.create({tenantId:req.tenantId,sourceBranchId,destinationBranchId,transferNo:await nextNo(req.tenantId,'TRF'),items:rows,reason:clean(req.body.reason,500),status:'pending_approval',requestedBy:req.user._id});res.status(201).json({success:true,data:x});
}));
router.get('/pharmacy/transfers',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>{const scope=isAdmin(req)?(req.query.branchId?{$or:[{sourceBranchId:req.query.branchId},{destinationBranchId:req.query.branchId}]}:{}):{$or:[{sourceBranchId:{$in:req.branchIds}},{destinationBranchId:{$in:req.branchIds}}]};res.json({success:true,data:await StockTransfer.find({tenantId:req.tenantId,...scope}).populate('sourceBranchId destinationBranchId','name').sort({createdAt:-1}).limit(200).lean()})}));
router.patch('/pharmacy/transfers/:id/approve',requirePermission('pharmacy.transfer.approve'),allowRoles('hospital_admin','branch_admin'),asyncHandler(async(req,res)=>{const x=await StockTransfer.findOne({_id:req.params.id,tenantId:req.tenantId,status:'pending_approval'});if(!x||(!isAdmin(req)&&(!branchAllowed(req,x.sourceBranchId)||!branchAllowed(req,x.destinationBranchId))))return fail(res,'Transfer not found or branch access denied',404);x.status='approved';x.approvedBy=req.user._id;await x.save();res.json({success:true,data:x})}));
router.post('/pharmacy/transfers/:id/dispatch',requirePermission('pharmacy.manage'),audit('pharmacy.transfer.dispatched','stock_transfer'),asyncHandler(async(req,res)=>{
 const session=await mongoose.startSession();let x;
 try{await session.withTransaction(async()=>{x=await StockTransfer.findOne({_id:req.params.id,tenantId:req.tenantId,status:'approved'}).session(session);if(!x||!branchAllowed(req,x.sourceBranchId))throw Object.assign(new Error('Approved transfer not found'),{status:404});for(const it of x.items){await addStockLedger({tenantId:req.tenantId,branchId:x.sourceBranchId,medicineId:it.medicineId,batchId:it.batchId,type:'transfer_out',quantity:it.quantity,sourceType:'stock_transfer',sourceId:x._id,userId:req.user._id,session,reason:x.reason||'Branch transfer'});}x.status='dispatched';x.dispatchedAt=new Date();await x.save({session});});}catch(e){return fail(res,e.message,e.status||409)}finally{await session.endSession()}res.json({success:true,data:x});
}));
router.post('/pharmacy/transfers/:id/receive',requirePermission('pharmacy.manage'),audit('pharmacy.transfer.received','stock_transfer'),asyncHandler(async(req,res)=>{
 const key=clean(req.headers['idempotency-key']||req.body.idempotencyKey,120);if(!key)return fail(res,'Idempotency-Key is required');
 const session=await mongoose.startSession();let x;
 try{await session.withTransaction(async()=>{x=await StockTransfer.findOne({_id:req.params.id,tenantId:req.tenantId}).session(session);if(!x||!branchAllowed(req,x.destinationBranchId))throw Object.assign(new Error('Dispatched transfer not found'),{status:404});if((x.receiveKeys||[]).includes(key))return;if(!['dispatched','partially_received'].includes(x.status))throw Object.assign(new Error('Transfer is not awaiting receipt'),{status:409});if(!Array.isArray(req.body.items)||!req.body.items.length)throw Object.assign(new Error('At least one transfer line must be received'),{status:422});for(const r of req.body.items){const it=x.items.id(r.itemId);if(!it)throw Object.assign(new Error('Transfer item not found'),{status:404});const accepted=qty(r.acceptedQuantity||0),damaged=qty(r.damagedQuantity||0),pending=qty(it.quantity-it.receivedQuantity-it.damagedQuantity);if(accepted+damaged<=0||accepted+damaged>pending)throw Object.assign(new Error('Received quantity exceeds in-transit quantity'),{status:409});if(accepted>0){let dest=await MedicineBatch.findOne({tenantId:req.tenantId,branchId:x.destinationBranchId,medicineId:it.medicineId,batchNo:it.batchNo}).session(session);const src=await MedicineBatch.findOne({_id:it.batchId,tenantId:req.tenantId}).session(session);if(!dest)dest=(await MedicineBatch.create([{tenantId:req.tenantId,branchId:x.destinationBranchId,medicineId:it.medicineId,batchNo:it.batchNo,expiryDate:src.expiryDate,quantity:0,purchasePrice:src.purchasePrice,sellingPrice:src.sellingPrice,mrp:src.mrp,status:src.status}],{session}))[0];else if(String(dest.expiryDate)!==String(src.expiryDate))throw Object.assign(new Error('Destination batch expiry does not match the source lot'),{status:409});await addStockLedger({tenantId:req.tenantId,branchId:x.destinationBranchId,medicineId:it.medicineId,batchId:dest._id,type:'transfer_in',quantity:accepted,sourceType:'stock_transfer',sourceId:x._id,userId:req.user._id,session,reason:'Transfer receipt'});}if(damaged>0){await InventoryTransaction.create([{tenantId:req.tenantId,branchId:x.destinationBranchId,medicineId:it.medicineId,batchId:it.batchId,type:'damaged',quantity:damaged,quantityIn:0,quantityOut:0,previousBalance:0,newBalance:0,sourceType:'stock_transfer',sourceId:x._id,reason:'Damaged in transit; not added to destination saleable stock',performedBy:req.user._id}],{session});}it.receivedQuantity=qty(it.receivedQuantity+accepted);it.damagedQuantity=qty(it.damagedQuantity+damaged);}const done=x.items.every(i=>i.receivedQuantity+i.damagedQuantity>=i.quantity);x.status=done?'received':'partially_received';x.receiveKeys.push(key);if(done){x.receivedAt=new Date();x.receivedBy=req.user._id;}await x.save({session});});}catch(e){return fail(res,e.message,e.status||409)}finally{await session.endSession()}res.json({success:true,data:x});
}));
router.post('/pharmacy/adjustments',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>{
 const batch=await MedicineBatch.findOne({_id:req.body.batchId,tenantId:req.tenantId,...branchFilter(req)});if(!batch)return fail(res,'Batch not found',404);const counted=qty(req.body.countedQuantity);if(counted<0)return fail(res,'Count cannot be negative');const reason=clean(req.body.reason,500);if(reason.length<5)return fail(res,'Adjustment reason is required');const x=await StockAdjustment.create({tenantId:req.tenantId,branchId:batch.branchId,adjustmentNo:await nextNo(req.tenantId,'ADJ'),medicineId:batch.medicineId,batchId:batch._id,systemQuantity:qty(batch.quantity),countedQuantity:counted,difference:qty(counted-batch.quantity),reason,status:'pending',requestedBy:req.user._id});res.status(201).json({success:true,data:x});
}));
router.get('/pharmacy/adjustments',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>res.json({success:true,data:await StockAdjustment.find({tenantId:req.tenantId,...branchFilter(req)}).populate('medicineId','name').populate('batchId','batchNo').sort({createdAt:-1}).limit(200).lean()})));
router.patch('/pharmacy/adjustments/:id/review',requirePermission('pharmacy.stock.adjust.approve'),allowRoles('hospital_admin','branch_admin'),audit('pharmacy.stock_adjustment.reviewed','stock_adjustment'),asyncHandler(async(req,res)=>{
 const session=await mongoose.startSession();let x;
 try{await session.withTransaction(async()=>{x=await StockAdjustment.findOne({_id:req.params.id,tenantId:req.tenantId,...branchFilter(req),status:'pending'}).session(session);if(!x)throw Object.assign(new Error('Pending adjustment not found'),{status:404});if(req.body.decision!=='approve'){x.status='rejected';x.approvedBy=req.user._id;x.approvedAt=new Date();await x.save({session});return;}const batch=await MedicineBatch.findOne({_id:x.batchId,tenantId:req.tenantId,branchId:x.branchId}).session(session);if(!batch)throw Object.assign(new Error('Batch not found'),{status:404});const diff=qty(x.countedQuantity-batch.quantity);if(diff>0){await addStockLedger({tenantId:req.tenantId,branchId:x.branchId,medicineId:x.medicineId,batchId:x.batchId,type:'adjustment',quantity:diff,quantityIn:diff,quantityOut:0,sourceType:'stock_adjustment',sourceId:x._id,userId:req.user._id,session,reason:x.reason});}else if(diff<0){await addStockLedger({tenantId:req.tenantId,branchId:x.branchId,medicineId:x.medicineId,batchId:x.batchId,type:'adjustment',quantity:-diff,quantityIn:0,quantityOut:-diff,sourceType:'stock_adjustment',sourceId:x._id,userId:req.user._id,session,reason:x.reason});}x.status='approved';x.approvedBy=req.user._id;x.approvedAt=new Date();await x.save({session});});}catch(e){return fail(res,e.message,e.status||409)}finally{await session.endSession()}res.json({success:true,data:x});
}));
router.get('/pharmacy/returns',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>res.json({success:true,data:await PharmacyReturn.find({tenantId:req.tenantId,...branchFilter(req)}).populate('patientId','firstName lastName uhid').populate('invoiceId','invoiceNo').sort({createdAt:-1}).limit(200).lean()})));
router.post('/pharmacy/returns',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>{
 const key=clean(req.headers['idempotency-key']||req.body.idempotencyKey,120);if(!key)return fail(res,'Idempotency-Key is required');
 const replay=await PharmacyReturn.findOne({tenantId:req.tenantId,idempotencyKey:key});if(replay)return res.json({success:true,data:replay,replayed:true});
 const session=await mongoose.startSession();let result;
 try{await session.withTransaction(async()=>{
  const patient=await Patient.findOne({_id:req.body.patientId,tenantId:req.tenantId,...(isAdmin(req)?{}:{branchId:{$in:req.branchIds}})}).session(session);if(!patient)throw Object.assign(new Error('Patient not found'),{status:404});
  const dispensing=req.body.dispensingId?await Dispensing.findOne({_id:req.body.dispensingId,tenantId:req.tenantId,patientId:patient._id,branchId:patient.branchId,status:'completed'}).session(session):null;
  const sale=req.body.saleId?await PharmacySale.findOne({_id:req.body.saleId,tenantId:req.tenantId,patientId:patient._id,branchId:patient.branchId}).session(session):null;
  if((!dispensing&&!sale)||(dispensing&&sale))throw Object.assign(new Error('Select exactly one valid original dispensing or pharmacy sale'),{status:422});
  if(!Array.isArray(req.body.items)||!req.body.items.length)throw Object.assign(new Error('Return items are required'),{status:422});
  const sourceItems=dispensing?dispensing.items:sale.items,rows=[];
  for(const it of req.body.items){
   const batch=await MedicineBatch.findOne({_id:it.batchId,tenantId:req.tenantId,branchId:patient.branchId}).session(session);if(!batch)throw Object.assign(new Error('Batch not found in the patient branch'),{status:404});
   const allocation=sourceItems.flatMap(x=>(x.batchAllocations||[]).map(a=>({item:x,allocation:a}))).find(x=>String(x.allocation.batchId)===String(batch._id));
   if(!allocation)throw Object.assign(new Error('Selected batch is not part of the original sale/dispensing'),{status:422});
   const requested=qty(it.quantity),remaining=qty(Number(allocation.allocation.quantity)-Number(allocation.allocation.returnedQuantity||0));
   if(requested<=0||requested>remaining)throw Object.assign(new Error('Return quantity exceeds the unreturned quantity'),{status:409});
   allocation.allocation.returnedQuantity=qty(Number(allocation.allocation.returnedQuantity||0)+requested);
   rows.push({medicineId:batch.medicineId,batchId:batch._id,quantity:requested,restockable:false,condition:clean(it.condition,200)});
  }
  await (dispensing||sale).save({session});
  result=(await PharmacyReturn.create([{tenantId:req.tenantId,idempotencyKey:key,branchId:patient.branchId,patientId:patient._id,invoiceId:dispensing?.invoiceId||sale?.invoiceId, saleId:sale?._id,dispensingId:dispensing?._id,returnNo:await nextNo(req.tenantId,'RET',session),items:rows,reason:clean(req.body.reason,500),status:'pending',requestedBy:req.user._id}],{session}))[0];
 });}catch(e){if(e.code===11000){result=await PharmacyReturn.findOne({tenantId:req.tenantId,idempotencyKey:key});if(result)return res.json({success:true,data:result,replayed:true});}return fail(res,e.message,e.status||409)}finally{await session.endSession()}
 res.status(201).json({success:true,data:result});
}));
router.patch('/pharmacy/returns/:id/review',requirePermission('pharmacy.stock.adjust.approve'),allowRoles('hospital_admin','branch_admin'),asyncHandler(async(req,res)=>{
 const session=await mongoose.startSession();let x,creditNote;
 try{await session.withTransaction(async()=>{
  x=await PharmacyReturn.findOne({_id:req.params.id,tenantId:req.tenantId,...branchFilter(req),status:'pending'}).session(session);if(!x)throw Object.assign(new Error('Pending return not found'),{status:404});
  if(req.body.decision!=='approve'){
   const source=x.dispensingId?await Dispensing.findOne({_id:x.dispensingId,tenantId:req.tenantId}).session(session):await PharmacySale.findOne({_id:x.saleId,tenantId:req.tenantId}).session(session);
   if(!source)throw Object.assign(new Error('Original sale/dispensing record no longer exists'),{status:409});for(const r of x.items){const allocation=source.items.flatMap(i=>i.batchAllocations||[]).find(a=>String(a.batchId)===String(r.batchId));if(!allocation||Number(allocation.returnedQuantity||0)<Number(r.quantity))throw Object.assign(new Error('Reserved return quantity no longer matches source record'),{status:409});allocation.returnedQuantity=qty(Number(allocation.returnedQuantity||0)-Number(r.quantity));}await source.save({session});
   x.status='rejected';x.reviewedBy=req.user._id;await x.save({session});return;
  }
  let refundValue=0;
  for(const r of req.body.items||[]){
   const it=x.items.id(r.itemId);if(!it)throw Object.assign(new Error('Return item not found'),{status:404});
   const restock=!!r.restockable,condition=clean(r.condition,200);if(restock&&condition.length<5)throw Object.assign(new Error('A documented condition assessment is required before restocking'),{status:422});
   it.restockable=restock;it.condition=condition;
   const batch=await MedicineBatch.findOne({_id:it.batchId,tenantId:req.tenantId,branchId:x.branchId}).session(session);if(!batch)throw Object.assign(new Error('Batch not found'),{status:404});
   if(restock){if(batch.expiryDate<=new Date()||batch.status!=='active')throw Object.assign(new Error('Expired or blocked batch cannot be restored to saleable stock'),{status:409});await addStockLedger({tenantId:req.tenantId,branchId:x.branchId,medicineId:it.medicineId,batchId:it.batchId,type:'customer_return',quantity:it.quantity,sourceType:'pharmacy_return',sourceId:x._id,userId:req.user._id,session,reason:condition});}
   else{const quarantineBatch=(await MedicineBatch.create([{tenantId:req.tenantId,branchId:x.branchId,medicineId:it.medicineId,batchNo:`Q-${x.returnNo}-${String(it._id).slice(-6)}`,expiryDate:batch.expiryDate,quantity:it.quantity,receivedQuantity:it.quantity,purchasePrice:batch.purchasePrice,sellingPrice:batch.sellingPrice,mrp:batch.mrp,supplierId:batch.supplierId,status:'quarantine'}],{session}))[0];await InventoryTransaction.create([{tenantId:req.tenantId,branchId:x.branchId,medicineId:it.medicineId,batchId:quarantineBatch._id,type:'customer_return',quantity:it.quantity,quantityIn:it.quantity,quantityOut:0,previousBalance:0,newBalance:it.quantity,sourceType:'pharmacy_return_quarantine',sourceId:x._id,reason:condition||'Returned stock quarantined pending assessment',performedBy:req.user._id}],{session});}
   refundValue+=Number(it.quantity)*Number(batch.sellingPrice||0);
  }
  if(x.invoiceId&&refundValue>0){
   const invoice=await Invoice.findOne({_id:x.invoiceId,tenantId:req.tenantId,patientId:x.patientId,branchId:x.branchId,status:{$in:['issued','unpaid','partial','partially_paid','paid']}}).session(session);
   if(invoice){const amount=money(Math.min(refundValue,Math.max(0,invoice.total-Number(invoice.creditNoteTotal||0))));if(amount>0){creditNote=(await CreditNote.create([{tenantId:req.tenantId,branchId:x.branchId,invoiceId:invoice._id,patientId:x.patientId,creditNoteNo:await nextNo(req.tenantId,'CN',session),amount,reason:`Pharmacy return ${x.returnNo}: ${x.reason}`,status:'issued',issuedBy:req.user._id}],{session}))[0];invoice.creditNoteTotal=money(Number(invoice.creditNoteTotal||0)+amount);await invoice.save({session});const tax=money(amount*(Number(invoice.total)>0?Number(invoice.tax||0)/Number(invoice.total):0));const base=money(amount-tax);await postPharmacyJournal({tenantId:req.tenantId,branchId:x.branchId,sourceType:'pharmacy_return_credit_note',sourceId:creditNote._id,description:`Credit note ${creditNote.creditNoteNo}`,lines:[{code:'4100',debit:base},{code:'2100',debit:tax},{code:'1100',credit:amount}],userId:req.user._id,session});}}
  }
  x.status='processed';x.reviewedBy=req.user._id;x.processedAt=new Date();await x.save({session});
 });}catch(e){return fail(res,e.message,e.status||409)}finally{await session.endSession()}
 res.json({success:true,data:x,creditNote,message:'Return reviewed. Eligible stock was restored only after assessment; any cash refund must be processed separately through Billing.'});
}));
router.get('/pharmacy/supplier-returns',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>res.json({success:true,data:await SupplierReturn.find({tenantId:req.tenantId,...branchFilter(req)}).populate('supplierId','name').sort({createdAt:-1}).limit(200).lean()})));
router.post('/pharmacy/supplier-returns',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>{
 const supplier=await Supplier.findOne({_id:req.body.supplierId,tenantId:req.tenantId,active:true});if(!supplier)return fail(res,'Supplier not found',404);const branch=await branchDoc(req,req.body.branchId);if(!branch)return fail(res,'Branch access denied',403);let purchaseOrder=null;if(req.body.purchaseOrderId){purchaseOrder=await PurchaseOrder.findOne({_id:req.body.purchaseOrderId,tenantId:req.tenantId,branchId:branch._id,supplierId:supplier._id});if(!purchaseOrder)return fail(res,'Purchase order does not match supplier and branch',404);}if(!Array.isArray(req.body.items)||!req.body.items.length)return fail(res,'Return items required');const rows=[];for(const it of req.body.items){const b=await MedicineBatch.findOne({_id:it.batchId,tenantId:req.tenantId,branchId:branch._id,supplierId:supplier._id,quantity:{$gte:Number(it.quantity)}});if(!b)return fail(res,'Batch is not supplied by this supplier or has insufficient stock',409);rows.push({medicineId:b.medicineId,batchId:b._id,quantity:qty(it.quantity),reason:clean(it.reason,300)});}const x=await SupplierReturn.create({tenantId:req.tenantId,branchId:branch._id,supplierId:supplier._id,purchaseOrderId:purchaseOrder?._id,returnNo:await nextNo(req.tenantId,'SRN'),supplierCreditNoteNo:clean(req.body.supplierCreditNoteNo,100),items:rows,status:'pending',requestedBy:req.user._id});res.status(201).json({success:true,data:x});
}));
router.patch('/pharmacy/supplier-returns/:id/process',requirePermission('pharmacy.purchase.approve'),allowRoles('hospital_admin','branch_admin'),asyncHandler(async(req,res)=>{
 const session=await mongoose.startSession();let x;
 try{await session.withTransaction(async()=>{x=await SupplierReturn.findOne({_id:req.params.id,tenantId:req.tenantId,...branchFilter(req),status:'pending'}).session(session);if(!x)throw Object.assign(new Error('Supplier return not found'),{status:404});let total=0;for(const it of x.items){const b=await MedicineBatch.findOne({_id:it.batchId,tenantId:req.tenantId,branchId:x.branchId}).session(session);if(!b||b.quantity<it.quantity)throw Object.assign(new Error('Stock no longer available'),{status:409});await addStockLedger({tenantId:req.tenantId,branchId:x.branchId,medicineId:it.medicineId,batchId:it.batchId,type:'supplier_return',quantity:it.quantity,sourceType:'supplier_return',sourceId:x._id,userId:req.user._id,session,reason:it.reason||'Supplier return'});total+=it.quantity*Number(b.purchasePrice||0);}x.supplierCreditNoteNo=clean(req.body.supplierCreditNoteNo||x.supplierCreditNoteNo,100);x.creditAmount=money(req.body.creditAmount||total);if(x.purchaseOrderId){const po=await PurchaseOrder.findOne({_id:x.purchaseOrderId,tenantId:req.tenantId,supplierId:x.supplierId,branchId:x.branchId}).session(session);if(!po)throw Object.assign(new Error('Linked purchase order not found'),{status:404});po.supplierCreditTotal=money(Number(po.supplierCreditTotal||0)+x.creditAmount);await po.save({session});}x.status='processed';x.approvedBy=req.user._id;x.processedAt=new Date();await x.save({session});const accounts=await ensurePharmacyAccounts(req.tenantId,session);await postPharmacyJournal({tenantId:req.tenantId,branchId:x.branchId,sourceType:'supplier_return',sourceId:x._id,description:`Supplier return ${x.returnNo}`,lines:[{code:'2000',debit:money(total)},{code:'1200',credit:money(total)}],userId:req.user._id,session});});}catch(e){return fail(res,e.message,e.status||409)}finally{await session.endSession()}res.json({success:true,data:x});
}));
router.get('/pharmacy/supplier-payments',requirePermission('pharmacy.supplier.manage'),asyncHandler(async(req,res)=>res.json({success:true,data:await SupplierPayment.find({tenantId:req.tenantId,...branchFilter(req)}).populate('supplierId','name').populate('purchaseOrderId','orderNo total').populate('paidBy','name').sort({createdAt:-1}).limit(200).lean()})));
router.post('/pharmacy/supplier-payments',requirePermission('pharmacy.supplier.manage'),asyncHandler(async(req,res)=>{
 const key=clean(req.headers['idempotency-key']||req.body.idempotencyKey,120);if(!key)return fail(res,'Idempotency-Key required');
 const existing=await SupplierPayment.findOne({tenantId:req.tenantId,idempotencyKey:key});if(existing)return res.json({success:true,data:existing,replayed:true});
 const supplier=await Supplier.findOne({_id:req.body.supplierId,tenantId:req.tenantId});if(!supplier)return fail(res,'Supplier not found',404);
 const branch=await branchDoc(req,req.body.branchId);if(!branch)return fail(res,'Branch access denied',403);
 const amount=money(req.body.amount);if(amount<=0)return fail(res,'Payment amount must be positive');
 let purchaseOrder=null;
 if(req.body.purchaseOrderId){purchaseOrder=await PurchaseOrder.findOne({_id:req.body.purchaseOrderId,tenantId:req.tenantId,branchId:branch._id,supplierId:supplier._id,status:{$in:['approved','partially_received','received']}});if(!purchaseOrder)return fail(res,'Approved purchase order not found for this supplier and branch',404);}
 const session=await mongoose.startSession();let payment;
 try{await session.withTransaction(async()=>{
  if(purchaseOrder){
   const reserved=await PurchaseOrder.findOneAndUpdate({_id:purchaseOrder._id,tenantId:req.tenantId,branchId:branch._id,supplierId:supplier._id,status:{$in:['approved','partially_received','received']},$expr:{$lte:[{$add:[{$ifNull:['$paidAmount',0]},{$ifNull:['$supplierCreditTotal',0]},amount]},'$total']}},{$inc:{paidAmount:amount}},{new:true,session});
   if(!reserved)throw Object.assign(new Error('Supplier payment exceeds the purchase order outstanding balance or another payment was posted concurrently'),{status:409});
  }
  payment=(await SupplierPayment.create([{tenantId:req.tenantId,branchId:branch._id,supplierId:supplier._id,purchaseOrderId:purchaseOrder?._id,amount,method:req.body.method||'bank_transfer',reference:clean(req.body.reference,120),idempotencyKey:key,paidBy:req.user._id}],{session}))[0];
  await postPharmacyJournal({tenantId:req.tenantId,branchId:branch._id,sourceType:'supplier_payment',sourceId:payment._id,description:`Supplier payment ${supplier.name}`,lines:[{code:'2000',debit:amount},{code:'1000',credit:amount}],userId:req.user._id,session});
 });}catch(e){if(e.code===11000){payment=await SupplierPayment.findOne({tenantId:req.tenantId,idempotencyKey:key});if(payment)return res.json({success:true,data:payment,replayed:true});}return fail(res,e.message,e.status||409)}finally{await session.endSession()}
 res.status(201).json({success:true,data:payment});
}));
router.get('/pharmacy/alerts',requirePermission('pharmacy.view'),asyncHandler(async(req,res)=>{
 const now=new Date(),warn=new Date(now);warn.setDate(warn.getDate()+Math.min(365,Math.max(1,Number(req.query.expiryDays)||90)));
 let branchIds=req.query.branchId?[req.query.branchId]:isAdmin(req)?(await Branch.find({tenantId:req.tenantId,active:true}).distinct('_id')).map(String):req.branchIds;
 if(req.query.branchId&&!branchAllowed(req,req.query.branchId))return fail(res,'Branch access denied',403);
 const [meds,batches]=await Promise.all([Medicine.find({tenantId:req.tenantId,active:true}).lean(),MedicineBatch.find({tenantId:req.tenantId,branchId:{$in:branchIds},quantity:{$gt:0}}).lean()]);
 const stock=new Map(),currentKeys=[];
 for(const b of batches){const k=`${b.branchId}:${b.medicineId}`;stock.set(k,(stock.get(k)||0)+Number(b.quantity||0));}
 const wanted=[];
 for(const branchId of branchIds)for(const m of meds){const n=stock.get(`${branchId}:${m._id}`)||0;if(n<=0)wanted.push({branchId,medicineId:m._id,type:'out_of_stock',message:`${m.name} is out of stock`});else if(m.reorderLevel>0&&n<=m.reorderLevel)wanted.push({branchId,medicineId:m._id,type:'low_stock',message:`${m.name} is below reorder level`});}
 for(const b of batches){if(b.expiryDate<=now)wanted.push({branchId:b.branchId,medicineId:b.medicineId,batchId:b._id,type:'expired',message:`Batch ${b.batchNo} is expired`});else if(b.expiryDate<=warn)wanted.push({branchId:b.branchId,medicineId:b.medicineId,batchId:b._id,type:'expiring',message:`Batch ${b.batchNo} expires soon`});}
 const data=[];
 for(const a of wanted){
  const alertKey=[a.branchId,a.type,a.medicineId||'',a.batchId||''].join(':');currentKeys.push(alertKey);
  let doc=await PharmacyAlert.findOne({tenantId:req.tenantId,alertKey});let notify=false;
  if(!doc){try{doc=await PharmacyAlert.create({...a,tenantId:req.tenantId,alertKey,status:'open'});notify=true;}catch(e){if(e.code!==11000)throw e;doc=await PharmacyAlert.findOne({tenantId:req.tenantId,alertKey});}}
  else if(doc.status==='resolved'){doc.status='open';doc.resolvedAt=undefined;doc.message=a.message;await doc.save();notify=true;}
  data.push(doc);
  if(notify){const pharmacists=await User.find({tenantId:req.tenantId,role:'pharmacist',active:true,branchIds:a.branchId}).select('_id').lean();if(pharmacists.length)await Notification.insertMany(pharmacists.map(u=>({tenantId:req.tenantId,branchId:a.branchId,userId:u._id,category:'system',title:'Pharmacy stock alert',message:a.message,link:'/pharmacy/alerts'}))).catch(()=>{});}
 }
 await PharmacyAlert.updateMany({tenantId:req.tenantId,branchId:{$in:branchIds},status:{$in:['open','acknowledged']},...(currentKeys.length?{alertKey:{$nin:currentKeys}}:{})},{$set:{status:'resolved',resolvedAt:new Date()}});
 const saved=await PharmacyAlert.find({tenantId:req.tenantId,branchId:{$in:branchIds},status:{$ne:'resolved'}}).populate('medicineId','name medicineCode').populate('batchId','batchNo expiryDate').sort({createdAt:-1}).lean();
 res.json({success:true,data:saved});
}));
router.patch('/pharmacy/alerts/:id/acknowledge',requirePermission('pharmacy.manage'),asyncHandler(async(req,res)=>{const x=await PharmacyAlert.findOneAndUpdate({_id:req.params.id,tenantId:req.tenantId,...branchFilter(req),status:'open'},{$set:{status:'acknowledged',acknowledgedBy:req.user._id}},{new:true});if(!x)return fail(res,'Open alert not found',404);res.json({success:true,data:x})}));
router.get('/pharmacy/reconciliation',requirePermission('pharmacy.reports.view'),asyncHandler(async(req,res)=>{
 if(req.query.branchId&&!branchAllowed(req,req.query.branchId))return fail(res,'Branch access denied',403);
 const batches=await MedicineBatch.find({tenantId:req.tenantId,...(req.query.branchId?{branchId:req.query.branchId}:branchFilter(req))}).populate('medicineId','name medicineCode').populate('branchId','name').sort({createdAt:-1}).limit(1000).lean();
 const results=[];
 for(const b of batches){const agg=await InventoryTransaction.aggregate([{$match:{tenantId:new mongoose.Types.ObjectId(req.tenantId),batchId:b._id}},{$group:{_id:null,in:{$sum:'$quantityIn'},out:{$sum:'$quantityOut'}}}]);const ledger=qty((agg[0]?.in||0)-(agg[0]?.out||0)),balance=qty(b.quantity||0);results.push({batchId:b._id,medicine:b.medicineId?.name,batchNo:b.batchNo,branch:b.branchId?.name,storedBalance:balance,ledgerBalance:ledger,difference:qty(balance-ledger),reconciled:Math.abs(balance-ledger)<0.001});}
 res.json({success:true,data:{checked:results.length,mismatches:results.filter(x=>!x.reconciled),batches:results}});
}));
router.get('/pharmacy/reports',requirePermission('pharmacy.reports.view'),asyncHandler(async(req,res)=>{
 const branchId=req.query.branchId;if(branchId&&!branchAllowed(req,branchId))return fail(res,'Branch access denied',403);
 const match={tenantId:new mongoose.Types.ObjectId(req.tenantId),...(branchId?{branchId:new mongoose.Types.ObjectId(branchId)}:isAdmin(req)?{}:{branchId:{$in:req.branchIds.map(x=>new mongoose.Types.ObjectId(x))}})};
 const from=req.query.from?new Date(`${req.query.from}T00:00:00.000`):new Date(Date.now()-90*86400000),to=req.query.to?new Date(`${req.query.to}T23:59:59.999`):new Date();
 if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to)return fail(res,'Invalid report date range');
 const dated={...match,createdAt:{$gte:from,$lte:to}};
 const [stock,ledger,sales,dispensings,purchases,expiry,suppliers,poTotals]=await Promise.all([
  MedicineBatch.aggregate([{$match:match},{$group:{_id:'$medicineId',units:{$sum:'$quantity'},value:{$sum:{$multiply:['$quantity','$purchasePrice']}}}}]),
  InventoryTransaction.aggregate([{$match:dated},{$group:{_id:'$type',count:{$sum:1},quantityIn:{$sum:'$quantityIn'},quantityOut:{$sum:'$quantityOut'}}}]),
  PharmacySale.aggregate([{$match:dated},{$group:{_id:null,count:{$sum:1},revenue:{$sum:'$total'}}}]),
  Dispensing.aggregate([{$match:dated},{$group:{_id:null,count:{$sum:1},value:{$sum:'$total'}}}]),
  PurchaseOrder.aggregate([{$match:dated},{$group:{_id:'$status',count:{$sum:1},amount:{$sum:'$total'}}}]),
  MedicineBatch.find({...match,expiryDate:{$lte:new Date(Date.now()+90*86400000)}}).populate('medicineId','name').sort({expiryDate:1}).limit(500).lean(),
  Supplier.find({tenantId:req.tenantId,active:true}).select('name supplierCode openingBalance').lean(),
  PurchaseOrder.aggregate([{$match:{...match,status:{$in:['approved','partially_received','received']}}},{$group:{_id:'$supplierId',ordered:{$sum:'$total'},paid:{$sum:'$paidAmount'},returned:{$sum:'$supplierCreditTotal'}}}])
 ]);
 const medicineIds=stock.map(x=>x._id);const medicineDocs=await Medicine.find({tenantId:req.tenantId,_id:{$in:medicineIds}}).select('name medicineCode').lean();const medicineMap=new Map(medicineDocs.map(x=>[String(x._id),x]));const stockNamed=stock.map(x=>({...x,medicineName:medicineMap.get(String(x._id))?.name||'Medicine',medicineCode:medicineMap.get(String(x._id))?.medicineCode||''}));
 const outstanding=suppliers.map(x=>{const row=poTotals.find(y=>String(y._id)===String(x._id))||{},ordered=Number(row.ordered||0),paid=Number(row.paid||0),returned=Number(row.returned||0);return {_id:x._id,name:x.name,ordered,paid,returned,openingBalance:isAdmin(req)?Number(x.openingBalance||0):0,outstanding:money(Math.max(0,ordered-paid-returned)+(isAdmin(req)?Number(x.openingBalance||0):0))};});
 res.json({success:true,data:{stock:stockNamed,ledger,sales:sales[0]||{count:0,revenue:0},dispensings:dispensings[0]||{count:0,value:0},purchases,expiry,suppliers:outstanding,period:{from,to}}});
}));
router.get('/pharmacy/patients/:patientId/dispensings',requirePermission('pharmacy.manage'),allowRoles('hospital_admin','branch_admin','pharmacist'),asyncHandler(async(req,res)=>{const p=await accessiblePatient(req,req.params.patientId);if(!p)return fail(res,'Patient not found',404);const data=await Dispensing.find({tenantId:req.tenantId,patientId:p._id,...branchFilter(req)}).populate('prescriptionId','prescriptionNo').populate('pharmacistId','name').populate('invoiceId','invoiceNo total').sort({createdAt:-1}).lean();res.json({success:true,data})}));

router.get('/medicines',requirePermission('pharmacy.view'),asyncHandler(async(req,res)=>{const q=Medicine.find({tenantId:req.tenantId,active:true}).sort({name:1});if(!req.permissions?.includes('pharmacy.manage')&&!isAdmin(req))q.select('name genericName brandName strength unit active');res.json({success:true,data:await q.lean()})}));
router.post('/medicines',requirePermission('pharmacy.manage'),allowRoles('hospital_admin','branch_admin','pharmacist'),asyncHandler(async(req,res)=>{const name=clean(req.body.name,180);if(!name)return fail(res,'Medicine name is required');const x=await Medicine.create({tenantId:req.tenantId,name,genericName:clean(req.body.genericName,180),strength:clean(req.body.strength,80),unit:clean(req.body.unit||'unit',30),reorderLevel:Number(req.body.reorderLevel||0),createdBy:req.user._id});res.status(201).json({success:true,data:x})}));
module.exports=router;
