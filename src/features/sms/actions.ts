'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/features/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptSmsSecret,encryptSmsSecret } from '@/services/sms/credentials';
import { verifyGramvistaAccount } from '@/services/sms/gramvista';
import { adminText as t } from '@/i18n/admin';
import type { ActionState } from '@/types/domain';

const schema=z.object({
 mode:z.enum(['platform','own']),
 sender_id:z.string().trim().max(11).default(''),
 api_key:z.string().trim().max(500).default(''),
 webhook_secret:z.string().trim().max(500).default(''),
});
export async function saveMtaaSmsSettings(_:ActionState,form:FormData):Promise<ActionState>{
 const {profile}=await requireAdmin();
 if(profile.role!=='mtaa_admin'||!profile.mtaa_id)return {error:t.smsMtaaOnly};
 const parsed=schema.safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:t.invalid};
 const p=parsed.data;
 if(p.mode==='own'&&p.sender_id&&!/^[A-Za-z0-9 ]{1,11}$/.test(p.sender_id))return {error:t.invalidSenderId};
 if(p.api_key&&!/^gvs_(?:test|live)_[A-Za-z0-9_-]{8,}$/.test(p.api_key))return {error:t.invalidSmsApiKey};
 if(p.webhook_secret&&p.webhook_secret.length<32)return {error:t.invalidWebhookSecret};
 let encryptedKey:string|null=null,encryptedWebhook:string|null=null;
 let resolvedSender=p.sender_id;
 try{
  let candidateKey=p.api_key;
  if(p.mode==='own'&&!candidateKey){
   const {data,error}=await createAdminClient().rpc('mtaa_sms_configuration',{p_mtaa:profile.mtaa_id});
   const current=data as null|{encrypted_api_key?:string};
   if(error||!current?.encrypted_api_key)return {error:t.invalidSmsApiKey};
   candidateKey=decryptSmsSecret(current.encrypted_api_key,`${profile.mtaa_id}:api-key`);
  }
  if(p.mode==='own'){
   const verified=await verifyGramvistaAccount({env:{
   GRAMVISTA_SMS_API_URL:process.env.GRAMVISTA_SMS_API_URL,
   GRAMVISTA_SMS_API_KEY:candidateKey,
   GRAMVISTA_SMS_SENDER_ID:p.sender_id||'MTAACONNECT',
   },autoSelectSender:!p.sender_id});
   resolvedSender=verified.senderId;
  }
  if(p.api_key)encryptedKey=encryptSmsSecret(p.api_key,`${profile.mtaa_id}:api-key`);
  if(p.webhook_secret)encryptedWebhook=encryptSmsSecret(p.webhook_secret,`${profile.mtaa_id}:webhook`);
 }catch{return {error:t.smsConnectionFailed};}
 const {error}=await createAdminClient().rpc('save_mtaa_sms_configuration',{
  p_actor:profile.id,p_mtaa:profile.mtaa_id,p_mode:p.mode,p_provider:'gramvista',p_sender:resolvedSender||null,
  p_encrypted_key:encryptedKey,p_encrypted_webhook:encryptedWebhook,
 });
 if(error)return {error:t.failedSave};
 revalidatePath('/admin/settings');
 return {success:t.saved};
}
