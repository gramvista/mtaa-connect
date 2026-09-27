import 'server-only';
import { z } from 'zod';
import type { SMSProvider,SMSRequest } from './types';
import { mockEnabled } from '../payments/provider';
import { verifyMockSignature } from '../webhook-signature';
import { gramvistaProvider } from './gramvista';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptSmsSecret } from './credentials';

export function smsProvider():SMSProvider {
 if(process.env.SMS_PROVIDER==='gramvista')return gramvistaProvider();
 if(process.env.SMS_PROVIDER!=='mock'||!mockEnabled())throw new Error('SMS provider is not configured');
 const send=async (input:SMSRequest)=>({providerMessageId:'mock-'+input.idempotencyKey,status:'sent' as const});
 return {
  name:'mock',sendSingleSMS:send,async sendBulkSMS(inputs){return Promise.all(inputs.map(send));},
  async getDeliveryStatus(){return 'unknown';},
  async processDeliveryWebhook(body,headers){
   const secret=process.env.SMS_WEBHOOK_SECRET;
   if(!secret||secret.length<32)throw new Error('Missing secret');
   verifyMockSignature(body,headers,secret);
   return z.object({providerMessageId:z.string().min(1).max(150),status:z.enum(['delivered','failed'])}).parse(JSON.parse(body));
  },
 };
}

export async function smsProviderForMtaa(mtaaId:string):Promise<SMSProvider>{
 const {data,error}=await createAdminClient().rpc('mtaa_sms_configuration',{p_mtaa:mtaaId});
 if(error)throw new Error('SMS configuration unavailable');
 const config=data as null|{mode:string;provider:string;sender_id:string|null;status:string;encrypted_api_key:string|null;encrypted_webhook_secret:string|null};
 if(!config||config.mode==='platform')return smsProvider();
 if(config.status!=='active'||config.provider!=='gramvista'||!config.sender_id||!config.encrypted_api_key)throw new Error('Mtaa SMS provider is not active');
 return gramvistaProvider({env:{
  GRAMVISTA_SMS_API_URL:process.env.GRAMVISTA_SMS_API_URL,
  GRAMVISTA_SMS_API_KEY:decryptSmsSecret(config.encrypted_api_key,`${mtaaId}:api-key`),
  GRAMVISTA_SMS_SENDER_ID:config.sender_id,
  GRAMVISTA_SMS_WEBHOOK_SECRET:config.encrypted_webhook_secret?decryptSmsSecret(config.encrypted_webhook_secret,`${mtaaId}:webhook`):undefined,
 }});
}
