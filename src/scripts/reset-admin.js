// Usage: npm run reset-admin   -> (re)creates the .env admin login without starting the web server
require('dotenv').config();
const connectDB=require('../config/db');
connectDB().then(async()=>{console.log('MongoDB connected:',require('mongoose').connection.name);await require('../services/envAdmin')();process.exit(0)}).catch(e=>{console.error('Failed:',e.message);console.error('Check that MongoDB is running and MONGODB_URI in server/.env is correct.');process.exit(1)});
