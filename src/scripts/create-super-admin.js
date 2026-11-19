require('dotenv').config();
const argon2=require('argon2');const connectDB=require('../config/db');const {User}=require('../models');
(async()=>{try{
 const {SUPER_ADMIN_NAME,SUPER_ADMIN_EMAIL,SUPER_ADMIN_PASSWORD}=process.env;
 if(!SUPER_ADMIN_NAME||!SUPER_ADMIN_EMAIL||!SUPER_ADMIN_PASSWORD||SUPER_ADMIN_PASSWORD.length<16)throw new Error('Set SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (minimum 16 characters) in server/.env');
 await connectDB();
 const email=SUPER_ADMIN_EMAIL.toLowerCase().trim();
 const exists=await User.findOne({email,role:'super_admin'});
 if(exists)throw new Error('A Super Admin with this email already exists');
 await User.create({name:SUPER_ADMIN_NAME,email,passwordHash:await argon2.hash(SUPER_ADMIN_PASSWORD),role:'super_admin',active:true});
 console.log('Super Admin account created. Remove the bootstrap credentials from the environment after use.');
 await require('mongoose').disconnect();
 }catch(e){console.error(e.message);process.exit(1)}})();
