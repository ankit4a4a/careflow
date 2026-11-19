const {Doctor,Appointment,Consultation}=require('../models');
async function doctorPatientIds(req){
 if(req.user.role!=='doctor')return null;
 const doctor=await Doctor.findOne({tenantId:req.tenantId,userId:req.user._id,branchIds:{$in:req.branchIds}}).select('_id');
 if(!doctor)return [];
 const [appointments,consultations]=await Promise.all([
  Appointment.distinct('patientId',{tenantId:req.tenantId,doctorId:doctor._id}),
  Consultation.distinct('patientId',{tenantId:req.tenantId,doctorId:doctor._id})
 ]);
 return [...new Set([...appointments,...consultations].map(String))];
}
module.exports={doctorPatientIds};
