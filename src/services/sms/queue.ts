import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { smsProviderForMtaa } from './provider';
import { SMSProviderError } from './types';

export async function processSmsQueue(limit=25){
 const db=createAdminClient();
 const {error:maintenanceError}=await db.rpc('run_maintenance');
 if(maintenanceError)throw new Error('Maintenance failed');
 const {data:batch,error}=await db.rpc('claim_sms',{p_limit:limit});
 if(error)throw new Error('Queue unavailable');
 let processed=0;
 for(const job of batch as {id:string;phone:string;message:string;mtaa_id:string}[]){
  let provider;
  try{provider=await smsProviderForMtaa(job.mtaa_id);}catch{
   const {error:recordError}=await db.rpc('record_sms_result',{p_id:job.id,p_provider:'unconfigured',p_provider_id:null,p_status:'failed',p_error:'SMS provider configuration required'});
   if(recordError)throw new Error('Outcome persistence failed; reconcile claimed jobs');
   processed++;continue;
  }
  let providerId:string|null=null,status='uncertain';
  try{
   const result=await provider.sendSingleSMS({idempotencyKey:job.id,phone:job.phone,message:job.message});
   providerId=result.providerMessageId;status='sent';
  }catch(error){if(error instanceof SMSProviderError&&!error.ambiguous)status='failed';}
  const {error:recordError}=await db.rpc('record_sms_result',{p_id:job.id,p_provider:provider.name,p_provider_id:providerId,p_status:status,p_error:status==='uncertain'?'Provider outcome unknown; reconcile before retry':null});
  if(recordError)throw new Error('Outcome persistence failed; reconcile claimed jobs');
  processed++;
 }
 return processed;
}
