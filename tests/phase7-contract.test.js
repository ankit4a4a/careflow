
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const models=read('src/models/index.js');
const pharmacy=read('src/routes/pharmacy.js');
const auth=read('src/middleware/auth.js');
const server=read('src/server.js');
const clinical=read('src/routes/clinical.js');
const resources=read('src/routes/resources.js');
const portal=read('src/routes/patient-portal.js');
const ui=read('client/js/pharmacy.js');
const app=read('client/js/app.js');
const html=read('client/index.html');

test('Phase 7 extends the existing Medicine, MedicineBatch and InventoryTransaction models',()=>{
 assert.match(models,/const Medicine = model\('Medicine'/);
 assert.match(models,/const MedicineBatch = model\('MedicineBatch'/);
 assert.match(models,/const InventoryTransaction = model\('InventoryTransaction'/);
 assert.match(models,/MedicineBatch\.schema\.add/);
 assert.match(models,/InventoryTransaction\.schema\.add/);
});
test('Pharmacy domain models are tenant scoped and indexed',()=>{
 for(const name of ['MedicineCategory','GenericMedicine','Supplier','PurchaseOrder','GoodsReceipt','Dispensing','StockTransfer','StockAdjustment','PharmacySale','PharmacyReturn','DispensingReversal','SupplierReturn','PharmacyAlert','SupplierPayment'])assert.match(models,new RegExp(`model\\('${name}'`));
 assert.match(models,/Supplier\.index\(\{tenantId:1,supplierCode:1\}/);
 assert.match(models,/Dispensing\.index\(\{tenantId:1,idempotencyKey:1\}/);
 assert.match(models,/PharmacyAlert\.index\(\{tenantId:1,alertKey:1\}/);
});
test('Inventory transaction records preserve before/after balances and source references',()=>{
 assert.match(models,/quantityIn:\{type:Number/);
 assert.match(models,/quantityOut:\{type:Number/);
 assert.match(models,/previousBalance:\{type:Number/);
 assert.match(models,/newBalance:\{type:Number/);
 assert.match(models,/sourceType:String,sourceId:Schema\.Types\.ObjectId/);
});
test('Goods receipt is idempotent and only commits received stock in a transaction',()=>{
 assert.match(pharmacy,/Idempotency-Key is required/);
 assert.match(pharmacy,/withTransaction\(async\(\)=>\{/);
 assert.match(pharmacy,/type:'purchase_receipt'/);
 assert.match(pharmacy,/status:\{\$in:\['approved','partially_received'\]\}/);
 assert.match(models,/GoodsReceipt\.index\(\{tenantId:1,idempotencyKey:1\}/);
});
test('Purchase orders require submission and authorized approval before receiving',()=>{
 assert.match(pharmacy,/purchase-orders\/:id\/submit/);
 assert.match(pharmacy,/purchase-orders\/:id\/approve/);
 assert.match(pharmacy,/pharmacy\.purchase\.approve/);
 assert.match(pharmacy,/status:'approved'/);
});
test('FEFO batch allocation excludes expired, inactive and empty batches',()=>{
 assert.match(pharmacy,/buildFefoPlan/);
 assert.match(pharmacy,/sort\(\{expiryDate:1,createdAt:1,_id:1\}\)/);
 assert.match(pharmacy,/status:'active',quantity:\{\$gt:0\},expiryDate:\{\$gt:new Date\(\)\}/);
 assert.match(pharmacy,/Select available batches in FEFO order/);
});
test('Stock changes use atomic balance comparisons and prevent negative stock',()=>{
 assert.match(pharmacy,/quantity:previous/);
 assert.match(pharmacy,/next<0/);
 assert.match(pharmacy,/Negative inventory is not permitted/);
 assert.match(pharmacy,/Stock changed concurrently/);
});
test('Every inventory movement is written through the inventory ledger helper or an explicit receipt/quarantine transaction',()=>{
 assert.match(pharmacy,/async function addStockLedger/);
 assert.match(pharmacy,/InventoryTransaction\.create/);
 assert.match(pharmacy,/type:'transfer_out'/);
 assert.match(pharmacy,/type:'transfer_in'/);
 assert.match(pharmacy,/type:'supplier_return'/);
 assert.match(pharmacy,/type:'customer_return'/);
});
test('Prescription dispensing requires finalized prescription, actual stock and idempotency',()=>{
 assert.match(pharmacy,/prescriptions\/:id\/dispense/);
 assert.match(pharmacy,/status:\{\$in:\['finalized','partially_dispensed','amended'\]\}/);
 assert.match(pharmacy,/dispensedQuantity/);
 assert.match(pharmacy,/type:'dispensing'/);
 assert.match(pharmacy,/Dispensing\.create/);
});
test('Prescription status is not changed by the retired non-stock-aware endpoint',()=>{
 assert.match(clinical,/router\.patch\('\/prescriptions\/:id\/dispensing'/);
 assert.match(clinical,/status\(410\)/);
 assert.match(clinical,/stock is deducted transactionally/);
});
test('Dispensing is linked to billing with BillingSourceLink and an issued invoice in the same transaction',()=>{
 assert.match(pharmacy,/createPharmacyInvoice/);
 assert.match(pharmacy,/sourceType:'pharmacy_dispensing'/);
 assert.match(pharmacy,/BillingSourceLink\.findOne/);
 assert.match(pharmacy,/BillingSourceLink\.create/);
 assert.match(pharmacy,/status:'issued'/);
 assert.match(pharmacy,/postPharmacyJournal/);
});
test('Counter sales deduct stock and create a Billing invoice without a separate payment subsystem',()=>{
 assert.match(pharmacy,/router\.post\('\/pharmacy\/sales'/);
 assert.match(pharmacy,/type:'pharmacy_sale'/);
 assert.match(pharmacy,/sourceType:'pharmacy_sale'/);
 assert.match(pharmacy,/createPharmacyInvoice/);
 assert.doesNotMatch(pharmacy,/InventoryTransaction\.deleteMany/);
});
test('Prescription-required medicines need a matching valid patient prescription',()=>{
 assert.match(pharmacy,/med\.prescriptionRequired/);
 assert.match(pharmacy,/Valid finalized prescription for this patient and branch is required/);
 assert.match(pharmacy,/authorized prescription quantity/);
});
test('Dispensing reversal creates an immutable reversal record and quarantines returned stock',()=>{
 assert.match(models,/DispensingReversal/);
 assert.match(pharmacy,/dispensings\/:id\/reverse/);
 assert.match(pharmacy,/type:'reversal'/);
 assert.match(pharmacy,/status:'quarantine'/);
 assert.match(pharmacy,/DispensingReversal\.create/);
});
test('Unsuitable customer returns are retained as non-saleable quarantine batches',()=>{
 assert.match(pharmacy,/pharmacy_return_quarantine/);
 assert.match(pharmacy,/status:'quarantine'/);
 assert.match(pharmacy,/restockable/);
 assert.match(pharmacy,/creditNoteTotal/);
});
test('Supplier returns and payments are linked to existing financial journals',()=>{
 assert.match(pharmacy,/supplier-returns\/:id\/process/);
 assert.match(pharmacy,/supplier-payments/);
 assert.match(pharmacy,/sourceType:'supplier_return'/);
 assert.match(pharmacy,/sourceType:'supplier_payment'/);
 assert.match(pharmacy,/exceeds the purchase order outstanding balance/);
});
test('Branch transfer deducts on dispatch and adds stock only on idempotent receipt',()=>{
 assert.match(pharmacy,/transfers\/:id\/dispatch/);
 assert.match(pharmacy,/type:'transfer_out'/);
 assert.match(pharmacy,/transfers\/:id\/receive/);
 assert.match(pharmacy,/type:'transfer_in'/);
 assert.match(pharmacy,/receiveKeys/);
 assert.match(models,/receiveKeys:\[String\]/);
});
test('Stock adjustments require approval and create ledger movements',()=>{
 assert.match(pharmacy,/pharmacy\/adjustments/);
 assert.match(pharmacy,/pharmacy\.stock\.adjust\.approve/);
 assert.match(pharmacy,/type:'adjustment'/);
});
test('Tenant and branch scope is applied to pharmacy routes',()=>{
 assert.match(pharmacy,/router\.use\(authenticate,requireTenant\)/);
 assert.match(pharmacy,/branchAllowed/);
 assert.match(pharmacy,/branchFilter/);
 assert.match(pharmacy,/Branch access denied/);
 assert.match(pharmacy,/tenantId:req\.tenantId/);
});
test('Pharmacy permissions are granted by role, not merely frontend navigation',()=>{
 assert.match(auth,/pharmacist:\[[^\]]*pharmacy\.manage/);
 assert.match(auth,/pharmacy\.purchase\.approve/);
 assert.match(auth,/pharmacy\.stock\.adjust\.approve/);
 assert.match(auth,/pharmacy\.transfer\.approve/);
});
test('Patient portal dispensing history is restricted to the linked patient',()=>{
 assert.match(portal,/router\.use\(authenticate,requireTenant,requirePatient\)/);
 assert.match(portal,/router\.get\('\/dispensings'/);
 assert.match(portal,/patientId:req\.user\.patientId/);
});
test('Doctor dispensing history is scoped to the authenticated doctor profile',()=>{
 assert.match(pharmacy,/pharmacy\/doctor\/dispensings/);
 assert.match(pharmacy,/userId:req\.user\._id/);
 assert.match(pharmacy,/doctorId:doctor\._id/);
});
test('Pharmacy alerts are deduplicated and notifications are sent to assigned pharmacists',()=>{
 assert.match(models,/alertKey:\{type:String,required:true\}/);
 assert.match(pharmacy,/findOne\(\{tenantId:req\.tenantId,alertKey\}\)/);
 assert.match(pharmacy,/Notification\.insertMany/);
});
test('Pharmacy dashboard and reports aggregate persisted database records',()=>{
 assert.match(pharmacy,/PharmacySale\.aggregate/);
 assert.match(pharmacy,/InventoryTransaction\.aggregate/);
 assert.match(pharmacy,/MedicineBatch\.aggregate/);
 assert.match(pharmacy,/router\.get\('\/pharmacy\/reports'/);
});
test('Existing medicine API aliases remain available and legacy duplicate handlers are removed',()=>{
 assert.match(pharmacy,/router\.get\('\/medicines'/);
 assert.match(pharmacy,/router\.post\('\/medicines'/);
 assert.doesNotMatch(resources,/router\.get\('\/medicines'/);
 assert.doesNotMatch(resources,/router\.post\('\/medicines'/);
});
test('Pharmacy routes are mounted inside the existing versioned Express application',()=>{
 assert.match(server,/app\.use\('\/api\/v1',require\('\.\/routes\/pharmacy'\)\)/);
 assert.match(server,/routes\/finance/);
 assert.match(server,/routes\/resources/);
});
test('Frontend loads pharmacy screens and exposes actual workflow pages',()=>{
 assert.match(html,/js\/pharmacy\.js/);
 for(const name of ['pharmacyDashboard','pharmacyCatalogue','pharmacyPurchases','pharmacyInventory','pharmacyPrescriptionQueue','pharmacyDispenseModal','pharmacySales','pharmacyTransfers','pharmacyAdjustments','pharmacyExpiry','pharmacyReports','pharmacyReturns'])assert.match(ui,new RegExp(`function ${name}`));
 assert.match(app,/Prescription Queue/);
 assert.match(app,/Returns & Supplier Payments/);
});
test('Pharmacy UI uses idempotency keys for stock-changing submissions',()=>{
 assert.match(ui,/Idempotency-Key/);
 assert.match(ui,/Confirm dispensing/);
 assert.match(ui,/FEFO recommended batches/);
});

test('Branch-specific medicine pricing is stored and applied to dispensing and counter sales',()=>{
 assert.match(models,/branchPricing:\[\{branchId/);
 assert.match(pharmacy,/medicines\/:id\/branch-pricing/);
 assert.match(pharmacy,/branchPrice\?\.sellingPrice/);
});
test('Configured tax-inclusive pricing is split into net amount and tax',()=>{
 assert.match(pharmacy,/function pharmacyBillLine/);
 assert.match(pharmacy,/tax\?\.inclusive/);
 assert.match(pharmacy,/cgst,sgst,igst/);
});
test('Customer returns reserve the original batch quantity transactionally and release rejected requests',()=>{
 assert.match(models,/returnedQuantity:\{type:Number,min:0,default:0\}/);
 assert.match(models,/PharmacyReturn\.index\(\{tenantId:1,idempotencyKey:1\}/);
 assert.match(pharmacy,/allocation\.allocation\.returnedQuantity/);
 assert.match(pharmacy,/Reserved return quantity no longer matches source record/);
});
test('Unsuitable transfer quantities are explicitly recorded as damaged in transit',()=>{
 assert.match(pharmacy,/Damaged in transit; not added to destination saleable stock/);
 assert.match(pharmacy,/type:'damaged'/);
});
test('Ledger reconciliation compares batch balance with summed inventory movement',()=>{
 assert.match(pharmacy,/pharmacy\/reconciliation/);
 assert.match(pharmacy,/ledgerBalance/);
 assert.match(pharmacy,/storedBalance/);
});
test('Legacy unassigned stock requires explicit tenant and branch before opening-balance migration',()=>{
 const migration=read('src/scripts/migrate-legacy-pharmacy-stock.js');
 assert.match(migration,/PHARMACY_LEGACY_TENANT_ID/);
 assert.match(migration,/PHARMACY_LEGACY_BRANCH_ID/);
 assert.match(migration,/legacy_opening_balance/);
 assert.match(migration,/branchId:\{\$exists:false\}/);
});

test('Supplier payment balances are atomically reserved on the purchase order',()=>{
 assert.match(models,/paidAmount:\{type:Number,min:0,default:0\}/);
 assert.match(models,/supplierCreditTotal:\{type:Number,min:0,default:0\}/);
 assert.match(pharmacy,/findOneAndUpdate\(\{_id:purchaseOrder\._id/);
 assert.match(pharmacy,/\$expr:\{\$lte:/);
 assert.match(pharmacy,/\$inc:\{paidAmount:amount\}/);
});
