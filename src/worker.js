require('dotenv').config();
const connectDB=require('./config/db');
const {startNotificationWorker}=require('./services/notificationWorker');
connectDB().then(()=>{startNotificationWorker();console.log('CareFlow background worker started');}).catch(err=>{console.error('Worker startup failed:',err.message);process.exit(1)});
process.on('SIGINT',()=>process.exit(0));process.on('SIGTERM',()=>process.exit(0));
