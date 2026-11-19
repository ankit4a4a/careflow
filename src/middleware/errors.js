module.exports=(err,req,res,next)=>{
 req.log?.error({err},'request failed');
 if(err.name==='MulterError')return res.status(err.code==='LIMIT_FILE_SIZE'?413:400).json({success:false,message:err.code==='LIMIT_FILE_SIZE'?(req.baseUrl?.includes('/doctors')?'Doctor photo exceeds the 3 MB limit':'File exceeds the 10 MB limit'):err.message});
 if(err.message==='Only PDF, JPEG and PNG files are accepted')return res.status(415).json({success:false,message:err.message});
 if(err.name==='ValidationError')return res.status(400).json({success:false,message:'Validation failed',errors:Object.values(err.errors).map(e=>e.message)});
 if(err.code===11000)return res.status(409).json({success:false,message:'A record with this unique value already exists'});
 if(err.name==='CastError')return res.status(400).json({success:false,message:'Invalid identifier'});
 const status=err.statusCode||err.status||500;
 res.status(status).json({success:false,message:status>=500?'Internal server error':err.message});
};
