'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { paymentProvider } from '@/services/payments/provider';
import { PaymentInitiationError } from '@/services/payments/types';
import { registrationSchema } from './schema';
import { phoneSchema } from '@/features/residents/schema';
import { clearRegistrationToken,consumeLimit,hash,registrationReceipt,registrationToken,replaceRegistrationToken } from './session';
import { registrationText as t } from '@/i18n/registration';
import type { ActionState } from '@/types/domain';

export async function registerResident(input:unknown):Promise<ActionState>{
 const parsed=registrationSchema.safeParse(input);
 if(!parsed.success)return {error:t.invalid};
 try {
  const r=parsed.data;
  // Shared database limits work across serverless instances and fail closed.
  if(!await consumeLimit('registration:global',300,3600)||
     !await consumeLimit('registration:phone:'+hash(r.phone_number),5,3600))return {error:t.limited};
  let token=await registrationToken(true);
  if(!token)throw new Error('Missing session');
  const provider=paymentProvider();
  const request=hash(JSON.stringify({...r,category_ids:[...r.category_ids].sort(),group_values:[...r.group_values].sort()}));
  const save=(sessionToken:string)=>createAdminClient().rpc('register_public_resident',{
   p_token:sessionToken,p_request:request,p_mtaa:r.mtaa_id,p_balozi:r.balozi_area_id||null,p_name:r.full_name,
   p_phone:r.phone_number,p_categories:r.category_ids,p_consent:r.consent,p_provider:provider.name,p_groups:r.group_values,
  });
  let {error}=await save(token);
  // A browser may register another resident. Preserve idempotency for an
  // unchanged retry, but rotate the receipt session for changed details.
  if(error?.message==='Session conflict'){
   token=await replaceRegistrationToken();
   ({error}=await save(token));
  }
  if(error){
   console.error('Public registration failed',{code:error.code,message:error.message});
   return {error:t.failed};
  }
  revalidatePath('/admin/residents');
 }catch{return {error:t.unavailable};}
 return {success:t.saved};
}

export async function startNewPublicRegistration(_form:FormData){
 void _form;
 await clearRegistrationToken();
 redirect('/register');
}

export async function startPublicPayment(_:ActionState,_form:FormData):Promise<ActionState>{
 let checkout:string|undefined;
 try{
  const paymentPhone=phoneSchema.safeParse(_form.get('payment_phone'));
  if(!paymentPhone.success)return {error:t.invalidPaymentPhone};
  const receipt=await registrationReceipt();
  if(!receipt)return {error:t.expiredSession};
  if(receipt.registration_status==='rejected')return {error:t.rejected};
  if(receipt.payment_status==='successful')return {success:t.paid};
  if(receipt.payment_status!=='pending')return {error:t.failed};
  if(!await consumeLimit('registration:checkout:'+receipt.payment_id,5))return {error:t.limited};
  const provider=paymentProvider();
  if(provider.name==='pending'||provider.name!==receipt.provider)return {error:t.providerPending};
  const {error:phoneError}=await createAdminClient().from('payments').update({payer_phone:paymentPhone.data})
   .eq('id',receipt.payment_id).eq('status','pending');
  if(phoneError)throw new Error('Unable to save payer phone');
  const result=await provider.initiate({id:receipt.payment_id,residentId:receipt.resident_id,phone:paymentPhone.data,amount:3000,currency:'TZS',idempotencyKey:receipt.idempotency_key});
  // Initiation never activates a subscription: only the verified webhook may.
  if(result.checkoutUrl){
   const url=new URL(result.checkoutUrl);
   if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid checkout URL');
   checkout=url.toString();
  }else return {success:provider.name==='mock'?t.mock:t.paymentStarted};
 }catch(error){
  if(error instanceof PaymentInitiationError)return {error:error.code==='method_unavailable'?t.paymentMethodUnavailable:t.invalidPaymentPhone};
  return {error:t.unavailable};
 }
 if(checkout)redirect(checkout);
 return {error:t.unavailable};
}

export async function refreshPublicPayment(_:ActionState,_form:FormData):Promise<ActionState>{
 void _form;
 try{
  const receipt=await registrationReceipt();
  if(!receipt)return {error:t.expiredSession};
  if(receipt.payment_status==='successful')return {success:t.paid};
  if(!await consumeLimit('registration:reconcile:'+receipt.payment_id,20))return {error:t.limited};
  const provider=paymentProvider();
  if(provider.name!==receipt.provider||!provider.reconcile)return {error:t.providerPending};
  const reconciliation=await provider.reconcile(receipt.payment_id);
  if(reconciliation.status==='pending')return {success:t.paymentStillPending};
  if(reconciliation.status==='failed')return {error:reconciliation.reason==='insufficient_funds'?t.insufficientFunds:t.paymentFailed};
  const event=reconciliation.payment;
  const {error}=await createAdminClient().rpc('settle_payment',{p_payment:event.paymentId,p_provider:provider.name,p_reference:event.providerReference,p_event:event.eventId,p_amount:event.amount,p_currency:event.currency});
  if(error)throw new Error('Payment settlement failed');
  revalidatePath('/register/payment');
  return {success:t.paid};
 }catch{return {error:t.unavailable};}
}
