import { paymentProvider } from '@/services/payments/provider';
import { readWebhookBody } from '@/services/request-body';
import { createAdminClient } from '@/lib/supabase/admin';
import { processSmsQueue } from '@/services/sms/queue';
export async function POST(request:Request){
 let provider;
 try{provider=paymentProvider();if(provider.name==='pending')return Response.json({error:'Provider not configured'},{status:503});}catch{return Response.json({error:'Provider not configured'},{status:503});}
 let event;
 try{event=await provider.verifyWebhook(await readWebhookBody(request),request.headers);}catch{return Response.json({error:'Invalid webhook'},{status:401});}
 if(!event)return Response.json({received:true});
 const {error}=await createAdminClient().rpc('settle_payment',{p_payment:event.paymentId,p_provider:provider.name,p_reference:event.providerReference,p_event:event.eventId,p_amount:event.amount,p_currency:event.currency});
 if(error)return Response.json({error:'Payment could not be processed'},{status:409});
 try{await processSmsQueue(25);}catch{/* Payment remains settled; the durable SMS queue can be retried safely. */}
 return Response.json({received:true});
}
