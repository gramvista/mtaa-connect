import { createHash,timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { smsProviderForMtaa } from '@/services/sms/provider';
import { SMSProviderError } from '@/services/sms/types';
export const maxDuration=60;
export async function POST(request:Request){
 const secret=process.env.WORKER_SECRET;
 if(!secret||secret.length<32)return Response.json({error:'Worker not configured'},{status:503});
 const supplied=request.headers.get('authorization')||'';
 const digest=(value:string)=>createHash('sha256').update(value).digest();
 if(!timingSafeEqual(digest(supplied),digest('Bearer '+secret)))return Response.json({error:'Unauthorized'},{status:401});
 const db=createAdminClient();
 const {error:maintenanceError}=await db.rpc('run_maintenance');
 if(maintenanceError)return Response.json({error:'Maintenance failed'},{status:503});
 const {data:batch,error}=await db.rpc('claim_sms',{p_limit:25});
 if(error)return Response.json({error:'Queue unavailable'},{status:503});
 let processed=0;
 for(const job of batch as {id:string;phone:string;message:string;mtaa_id:string}[]){
  let provider;try{provider=await smsProviderForMtaa(job.mtaa_id);}catch{
   const {error:recordError}=await db.rpc('record_sms_result',{p_id:job.id,p_provider:'unconfigured',p_provider_id:null,p_status:'failed',p_error:'SMS provider configuration required'});
   if(recordError)return Response.json({error:'Outcome persistence failed; reconcile claimed jobs'},{status:503});
   processed++;continue;
  }
  let providerId:string|null=null;let status='uncertain';
  try{const result=await provider.sendSingleSMS({idempotencyKey:job.id,phone:job.phone,message:job.message});providerId=result.providerMessageId;status='sent';}catch(error){if(error instanceof SMSProviderError&&!error.ambiguous)status='failed';/* Ambiguous sends are never retried automatically. */}
  const {error:recordError}=await db.rpc('record_sms_result',{p_id:job.id,p_provider:provider.name,p_provider_id:providerId,p_status:status,p_error:status==='uncertain'?'Provider outcome unknown; reconcile before retry':null});
  if(recordError)return Response.json({error:'Outcome persistence failed; reconcile claimed jobs'},{status:503});
  processed++;
 }
 return Response.json({processed});
}
