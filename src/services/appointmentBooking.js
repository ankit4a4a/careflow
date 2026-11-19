const mongoose=require('mongoose');
const {Appointment,Patient,Doctor,Branch,Department,AppointmentStatusHistory,Sequence}=require('../models');
const {buildAvailability,reserveSlot,releaseSlot}=require('./scheduling');
const {notifyPatient}=require('./notifications');
const ACTIVE=['scheduled','booked','confirmed','checked_in','waiting','called','in_consultation'];
async function createScheduledAppointment({tenantId,branchId,patientId,doctorId,startAt,reason='',notes='',consultationType='in_person',visitType='new',bookingSource='reception',createdBy,departmentId,rescheduledFrom}){
 const [patient,doctor,branch]=await Promise.all([Patient.findOne({_id:patientId,tenantId,branchId,active:true}),Doctor.findOne({_id:doctorId,tenantId,branchIds:branchId,status:{$nin:['inactive','archived']}}),Branch.findOne({_id:branchId,tenantId,active:true})]);
 if(!patient||!doctor||!branch)throw Object.assign(new Error('Patient, doctor or branch not found in this organization'),{status:404});
 const start=new Date(startAt);if(Number.isNaN(start.getTime())||start<=new Date())throw Object.assign(new Error('Choose a valid future appointment slot'),{status:422});
 const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:branch.timezone||'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(start);
 const availability=await buildAvailability({tenantId,doctorId,branchId,date:localDate});
 const slot=availability.slots.find(s=>s.startAt.getTime()===start.getTime());if(!slot)throw Object.assign(new Error('The selected appointment slot is no longer available'),{status:409});
 if(departmentId&&!(await Department.exists({_id:departmentId,tenantId,active:true,branchIds:branchId})))throw Object.assign(new Error('Selected department is not available at this branch'),{status:422});
 if(consultationType&&!['in_person','video','follow_up','emergency'].includes(consultationType))throw Object.assign(new Error('Invalid consultation type'),{status:422});
 if(Array.isArray(doctor.consultationTypes)&&doctor.consultationTypes.length&&!doctor.consultationTypes.includes(consultationType))throw Object.assign(new Error('This doctor does not offer the selected consultation type'),{status:422});
 let appointment,rescheduledAppointment;
 const session=await mongoose.startSession();
 try{
  await session.withTransaction(async()=>{
   await reserveSlot({tenantId,doctorId,branchId,startAt:slot.startAt,endAt:slot.endAt,capacity:slot.capacity,initialReservedCount:slot.reservedCount,session});
   const overlaps=await Appointment.find({tenantId,doctorId,branchId,status:{$in:ACTIVE},startAt:{$lt:slot.endAt},endAt:{$gt:slot.startAt}}).select('startAt endAt').session(session).lean();
   if(overlaps.some(a=>a.startAt.getTime()!==slot.startAt.getTime()||a.endAt.getTime()!==slot.endAt.getTime()))throw Object.assign(new Error('Doctor already has an overlapping appointment'),{status:409});
   const year=localDate.slice(0,4),key=`appointment:${tenantId}:${year}`;const seq=await Sequence.findOneAndUpdate({key},{$inc:{value:1}},{new:true,upsert:true,session});const appointmentNo=`APT-${year}-${String(seq.value).padStart(6,'0')}`;
   const docs=await Appointment.create([{tenantId,branchId,patientId,doctorId,departmentId:departmentId||slot.departmentId||undefined,startAt:slot.startAt,endAt:slot.endAt,status:'booked',appointmentNo,consultationType:consultationType||slot.consultationType||'in_person',visitType,bookingSource,reason:String(reason).slice(0,500),notes:String(notes).slice(0,2000),createdBy,rescheduledFrom}],{session});appointment=docs[0];
   await AppointmentStatusHistory.create([{tenantId,branchId,appointmentId:appointment._id,to:'booked',changedBy:createdBy,reason:'Appointment booked'}],{session});
   if(rescheduledFrom){const old=await Appointment.findOne({_id:rescheduledFrom,tenantId,status:{$in:['scheduled','booked','confirmed']}}).session(session);if(!old)throw Object.assign(new Error('Original appointment is no longer eligible for rescheduling'),{status:409});const previousStatus=old.status;old.status='rescheduled';old.statusHistory.push({from:previousStatus,to:'rescheduled',changedBy:createdBy,changedAt:new Date(),reason:'Rescheduled'});await old.save({session});await AppointmentStatusHistory.create([{tenantId,branchId:old.branchId,appointmentId:old._id,from:previousStatus,to:'rescheduled',changedBy:createdBy,reason:'Rescheduled'}],{session});await releaseSlot({tenantId,doctorId:old.doctorId,branchId:old.branchId,startAt:old.startAt,session});rescheduledAppointment=old;}
  });
 }finally{await session.endSession()}
 await notifyPatient({tenantId,patientId,branchId,category:'appointment',title:rescheduledAppointment?'Appointment rescheduled':'Appointment booked',message:rescheduledAppointment?`Your appointment has been rescheduled to ${appointment.startAt.toLocaleString()}.`:`Appointment ${appointment.appointmentNo} is booked for ${appointment.startAt.toLocaleString()}.`,link:'/appointments'});
 return appointment;
}
async function releaseAppointmentReservation(appointment){if(!appointment)return;await releaseSlot({tenantId:appointment.tenantId,doctorId:appointment.doctorId,branchId:appointment.branchId,startAt:appointment.startAt})}
module.exports={createScheduledAppointment,releaseAppointmentReservation,ACTIVE};
