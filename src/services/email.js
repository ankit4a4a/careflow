const nodemailer=require('nodemailer');
function configured(){return Boolean(process.env.SMTP_HOST&&process.env.MAIL_FROM)}
function transporter(){return nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined})}
exports.isConfigured=configured;
exports.sendMail=async({to,subject,text,html})=>{if(!configured())return {sent:false,reason:'smtp_not_configured'};await transporter().sendMail({from:process.env.MAIL_FROM,to,subject,text,html});return {sent:true}};
