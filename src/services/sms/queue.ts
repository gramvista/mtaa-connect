import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { smsProviderForMtaa } from './provider';
import { SMSProviderError } from './types';
import { mapSmsBatch,normalizeSmsBatchLimit,SMS_QUEUE_BATCH_LIMIT } from './batch';

export async function processSmsQueue(limit=SMS_QUEUE_BATCH_LIMIT){
 const db=createAdminClient();
 const {error:maintenanceError}=await db.rpc('run_maintenance');
 if(maintenanceError)throw new Error('Maintenance failed');
 const safeLimit=normalizeSmsBatchLimit(limit);
 const {data:batch,error}=await db.rpc('claim_sms',{p_limit:safeLimit});
 if(error)throw new Error('Queue unavailable');
 const jobs=(batch||[]) as {id:string;phone:string;message:string;mtaa_id:string}[];
 if(jobs.length>safeLimit)throw new Error('Queue returned an oversized batch');
 const providers=new Map<string,ReturnType<typeof smsProviderForMtaa>>();
 await mapSmsBatch(jobs,async job=>{
  let provider;
  try{
   let pendingProvider=providers.get(job.mtaa_id);
   if(!pendingProvider){pendingProvider=smsProviderForMtaa(job.mtaa_id);providers.set(job.mtaa_id,pendingProvider);}
   provider=await pendingProvider;
  }catch{
   const {error:recordError}=await db.rpc('record_sms_result',{p_id:job.id,p_provider:'unconfigured',p_provider_id:null,p_status:'failed',p_error:'SMS provider configuration required'});
   if(recordError)throw new Error('Outcome persistence failed; reconcile claimed jobs');
   return;
  }
  let providerId:string|null=null,status='uncertain';
  try{
   const result=await provider.sendSingleSMS({idempotencyKey:job.id,phone:job.phone,message:job.message});
   providerId=result.providerMessageId;status='sent';
  }catch(error){if(error instanceof SMSProviderError&&!error.ambiguous)status='failed';}
  const {error:recordError}=await db.rpc('record_sms_result',{p_id:job.id,p_provider:provider.name,p_provider_id:providerId,p_status:status,p_error:status==='uncertain'?'Provider outcome unknown; reconcile before retry':null});
  if(recordError)throw new Error('Outcome persistence failed; reconcile claimed jobs');
 });
 return jobs.length;
}
