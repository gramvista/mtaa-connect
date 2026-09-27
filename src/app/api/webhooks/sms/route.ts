import { smsProviderForMtaa } from '@/services/sms/provider';
import { readWebhookBody } from '@/services/request-body';
import { createAdminClient } from '@/lib/supabase/admin';
export async function POST(request:Request){
 const body=await readWebhookBody(request);
 let messageId:string;
 try{messageId=(JSON.parse(body) as {data?:{id?:string}}).data?.id||'';if(!/^gvs_msg_[A-Za-z0-9_-]+$/.test(messageId))throw new Error();}catch{return Response.json({error:'Invalid webhook'},{status:401});}
 const db=createAdminClient();
 const {data:recipient}=await db.from('sms_recipients').select('mtaa_id').eq('provider','gramvista').eq('provider_message_id',messageId).single();
 if(!recipient)return Response.json({error:'Invalid webhook'},{status:401});
 let provider;try{provider=await smsProviderForMtaa(recipient.mtaa_id);}catch{return Response.json({error:'Provider not configured'},{status:503});}
 let event;try{event=await provider.processDeliveryWebhook(body,request.headers);}catch{return Response.json({error:'Invalid webhook'},{status:401});}
 const {error}=await db.rpc('record_sms_delivery',{p_provider:provider.name,p_provider_id:event.providerMessageId,p_status:event.status});
 return Response.json(error?{error:'Delivery could not be processed'}:{received:true},{status:error?409:200});
}
