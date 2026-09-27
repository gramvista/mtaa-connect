export type SMSRequest={idempotencyKey:string;phone:string;message:string};
export type SMSResult={providerMessageId:string;status:'sent'};
export class SMSProviderError extends Error{
 constructor(message:string,readonly ambiguous:boolean){super(message);this.name='SMSProviderError';}
}
export interface SMSProvider {
 readonly name:string;
 sendSingleSMS(input:SMSRequest):Promise<SMSResult>;
 sendBulkSMS(inputs:SMSRequest[]):Promise<SMSResult[]>;
 getDeliveryStatus(id:string):Promise<'sent'|'delivered'|'failed'|'unknown'>;
 processDeliveryWebhook(body:string,headers:Headers):Promise<{providerMessageId:string;status:'delivered'|'failed'}>;
}
