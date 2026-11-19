
class SubscriptionBillingProvider {
 constructor(adapter=null){this.adapter=adapter;}
 get configured(){return !!this.adapter;}
 assertConfigured(){
  if(!this.adapter)throw Object.assign(new Error('Subscription payment provider is not configured'),{status:503,code:'SUBSCRIPTION_PROVIDER_NOT_CONFIGURED'});
 }
 async createCheckoutSession(input){this.assertConfigured();if(typeof this.adapter.createCheckoutSession!=='function')throw new Error('Provider adapter does not implement createCheckoutSession');return this.adapter.createCheckoutSession(input);}
 async verifyWebhook({rawBody,signature,headers}){this.assertConfigured();if(typeof this.adapter.verifyWebhook!=='function')throw new Error('Provider adapter does not implement verifyWebhook');return this.adapter.verifyWebhook({rawBody,signature,headers});}
 async fetchPayment(providerPaymentId){this.assertConfigured();if(typeof this.adapter.fetchPayment!=='function')throw new Error('Provider adapter does not implement fetchPayment');return this.adapter.fetchPayment(providerPaymentId);}
 async refund(providerPaymentId,amount,reason){this.assertConfigured();if(typeof this.adapter.refund!=='function')throw new Error('Provider adapter does not implement refund');return this.adapter.refund(providerPaymentId,amount,reason);}
}
module.exports=new SubscriptionBillingProvider();
module.exports.SubscriptionBillingProvider=SubscriptionBillingProvider;
