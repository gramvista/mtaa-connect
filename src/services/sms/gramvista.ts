import 'server-only';
import { createHmac,timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { parseGramvistaConfig } from './gramvista-config';
import { SMSProviderError,type SMSProvider,type SMSRequest } from './types';

type Fetcher=typeof fetch;
const sendSchema=z.object({success:z.literal(true),message_batch_id:z.string().min(1),campaign_id:z.uuid(),status:z.string()}).passthrough();
const messageSchema=z.object({message_reference:z.string().min(1),status:z.string()}).passthrough();
const webhookSchema=z.object({id:z.string().min(1),type:z.enum(['message.delivered','message.failed']),data:z.object({id:z.string().min(1),status:z.string()}).passthrough()}).passthrough();
const balanceSchema=z.object({available_sms:z.coerce.number().int().nonnegative(),reserved_sms:z.coerce.number().int().nonnegative(),total_sms:z.coerce.number().int().nonnegative()});
const senderListSchema=z.object({data:z.array(z.object({sender_name:z.string(),status:z.string()}).passthrough())});

async function json(response:Response){
 const text=await response.text();
 if(text.length>65_536)throw new SMSProviderError('Gramvista response too large',true);
 try{return JSON.parse(text) as unknown;}catch{throw new SMSProviderError('Invalid Gramvista response',true);}
}
function definiteStatus(status:number){return status>=400&&status<500&&status!==408;}
function deliveryStatus(value:string):'sent'|'delivered'|'failed'|'unknown'{
 const status=value.toLowerCase();
 if(status==='delivered')return 'delivered';
 if(['failed','rejected','expired'].includes(status))return 'failed';
 if(['queued','processing','submitted','sent'].includes(status))return 'sent';
 return 'unknown';
}
function verifyWebhook(secret:string,rawBody:string,headers:Headers){
 const signature=headers.get('x-gramvista-signature')||'';
 const match=/^t=(\d+),v1=([a-f0-9]{64})$/i.exec(signature);
 if(!match)throw new Error('Invalid Gramvista signature');
 const timestamp=Number(match[1]);
 if(!Number.isSafeInteger(timestamp)||Math.abs(Date.now()-timestamp*1000)>300_000)throw new Error('Expired Gramvista signature');
 const expected=Buffer.from(createHmac('sha256',secret).update(`${match[1]}.${rawBody}`).digest('hex'),'hex');
 const actual=Buffer.from(match[2],'hex');
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Invalid Gramvista signature');
}

export async function verifyGramvistaAccount(options:{env:Record<string,unknown>;fetcher?:Fetcher;autoSelectSender?:boolean}){
 const config=parseGramvistaConfig(options.env),fetcher=options.fetcher??fetch;
 const get=async(path:string)=>{
  const response=await fetcher(`${config.GRAMVISTA_SMS_API_URL}${path}`,{headers:{accept:'application/json',authorization:`Bearer ${config.GRAMVISTA_SMS_API_KEY}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20_000)});
  if(!response.ok)throw new Error('Gramvista account verification failed');
  return json(response);
 };
 const [balanceBody,sendersBody]=await Promise.all([get('/balance'),get('/sender-ids')]);
 const balance=balanceSchema.parse(balanceBody),senders=senderListSchema.parse(sendersBody).data;
 const approved=senders.filter(item=>item.status==='approved');
 const sender=options.autoSelectSender
  ? approved.length===1?approved[0]:senders.find(item=>item.sender_name===config.GRAMVISTA_SMS_SENDER_ID)
  : senders.find(item=>item.sender_name===config.GRAMVISTA_SMS_SENDER_ID);
 if(options.autoSelectSender&&approved.length>1&&
    !approved.some(item=>item.sender_name===config.GRAMVISTA_SMS_SENDER_ID))
  throw new Error('Choose one approved Gramvista Sender ID');
 if(!sender||sender.status!=='approved')throw new Error('Gramvista Sender ID is not approved');
 return {balance,senderId:sender.sender_name};
}

export function gramvistaProvider(options:{env?:Record<string,unknown>;fetcher?:Fetcher;now?:()=>number}={}):SMSProvider{
 const config=parseGramvistaConfig(options.env??process.env),fetcher=options.fetcher??fetch;
 const request=async(path:string,init:RequestInit={})=>fetcher(`${config.GRAMVISTA_SMS_API_URL}${path}`,{
  ...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20_000),
  headers:{accept:'application/json',authorization:`Bearer ${config.GRAMVISTA_SMS_API_KEY}`,...init.headers},
 });
 const send=async(input:SMSRequest)=>{
  let response:Response;
  try{response=await request('/messages',{method:'POST',headers:{'content-type':'application/json','idempotency-key':input.idempotencyKey},body:JSON.stringify({sender_id:config.GRAMVISTA_SMS_SENDER_ID,recipients:[input.phone],message:input.message})});}
  catch{throw new SMSProviderError('Gramvista send outcome is unknown',true);}
  if(!response.ok){await json(response);throw new SMSProviderError('Gramvista rejected the message',!definiteStatus(response.status));}
  const sent=sendSchema.parse(await json(response));
  let messagesResponse:Response;
  try{messagesResponse=await request(`/campaigns/${encodeURIComponent(sent.message_batch_id)}/messages`);}
  catch{throw new SMSProviderError('Gramvista accepted the message but reference lookup failed',true);}
  if(!messagesResponse.ok)throw new SMSProviderError('Gramvista accepted the message but reference lookup failed',true);
  const messages=z.object({data:z.array(messageSchema).min(1)}).parse(await json(messagesResponse));
  return {providerMessageId:messages.data[0].message_reference,status:'sent' as const};
 };
 return {
  name:'gramvista',sendSingleSMS:send,async sendBulkSMS(inputs){return Promise.all(inputs.map(send));},
  async getDeliveryStatus(id){
   const response=await request(`/messages/${encodeURIComponent(id)}`);
   if(!response.ok)return 'unknown';
   return deliveryStatus(messageSchema.parse(await json(response)).status);
  },
  async processDeliveryWebhook(body,headers){
   if(!config.GRAMVISTA_SMS_WEBHOOK_SECRET)throw new Error('Gramvista webhook secret is not configured');
   verifyWebhook(config.GRAMVISTA_SMS_WEBHOOK_SECRET,body,headers);
   const event=webhookSchema.parse(JSON.parse(body));
   return {providerMessageId:event.data.id,status:event.type==='message.delivered'?'delivered':'failed'};
  },
 };
}
