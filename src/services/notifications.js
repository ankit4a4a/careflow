const {User,Notification}=require('../models');
async function notifyPatient({tenantId,patientId,branchId,category,title,message,link}){
 try{
  const account=await User.findOne({tenantId,patientId,role:'patient',active:true}).select('_id');
  if(!account)return null;
  return await Notification.create({tenantId,branchId,userId:account._id,patientId,category,title,message,link});
 }catch(error){
  console.error('Patient notification could not be persisted:',error.message);
  return null;
 }
}
module.exports={notifyPatient};
