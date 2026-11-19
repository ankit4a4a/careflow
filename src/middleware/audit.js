const {AuditLog}=require('../models');
module.exports=(action,resource)=>async(req,res,next)=>{
 const originalJson=res.json.bind(res);res.json=(payload)=>{if(payload?.data?._id)res.locals.resourceId=String(payload.data._id);return originalJson(payload)};
 res.on('finish',()=>{if(req.user&&res.statusCode<400)AuditLog.create({tenantId:req.tenantId||undefined,branchId:req.branchId||req.body?.branchId||undefined,userId:req.user._id,action,resource,resourceId:res.locals.resourceId,ip:req.ip,metadata:{method:req.method,path:req.path,statusCode:res.statusCode}}).catch(err=>req.log?.error({err},'audit write failed'))});
 next();
};
