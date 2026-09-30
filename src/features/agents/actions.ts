'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAgent } from '@/features/auth/context';
import { paymentProvider } from '@/services/payments/provider';
import { createAdminClient } from '@/lib/supabase/admin';
import { agentRegistrationSchema } from './schema';
import { adminText as t } from '@/i18n/admin';
import type { ActionState } from '@/types/domain';

export async function registerByAgent(input:unknown):Promise<ActionState>{
 const {profile,db,assignments}=await requireAgent();
 const parsed=agentRegistrationSchema.safeParse(input);
 if(!parsed.success||!assignments.some(a=>a.mtaa_id===parsed.data.mtaa_id))return {error:t.invalid};
 const r=parsed.data;
 try{
  const provider=paymentProvider();
  const {data,error}=await db.rpc('register_agent_resident',{
   p_actor:profile.id,p_mtaa:r.mtaa_id,p_balozi:r.balozi_area_id||null,p_name:r.full_name,p_phone:r.phone_number,
   p_categories:r.category_ids,p_consent:r.consent,p_provider:provider.name,p_key:r.key,p_groups:r.group_values,
   p_occupations:r.occupation_codes,p_occupation_other:r.occupation_other||null,
  });
  if(error||!data)return {error:error?.code==='23505'?t.duplicate:t.failedSave};
  const result=data as {resident_id:string;payment_id:string};
  const {error:phoneError}=await createAdminClient().from('payments').update({payer_phone:r.payment_phone}).eq('id',result.payment_id).eq('agent_id',profile.id);
  if(phoneError)return {error:t.failedSave};
  const initiated=await provider.initiate({id:result.payment_id,residentId:result.resident_id,phone:r.payment_phone,amount:3000,currency:'TZS',idempotencyKey:r.key});
  revalidatePath('/agent');
  return {success:provider.name==='pending'?t.agentPaymentPending:t.agentRegistrationSaved,id:result.resident_id,url:initiated.checkoutUrl};
 }catch{return {error:t.unavailable};}
}

export async function updateOwnTask(_:ActionState,form:FormData):Promise<ActionState>{
 const {profile,db}=await requireAgent();
 const parsed=z.object({id:z.uuid(),status:z.enum(['in_progress','completed'])}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:t.invalid};
 const {error}=await db.rpc('set_agent_task_status',{p_actor:profile.id,p_task:parsed.data.id,p_status:parsed.data.status});
 if(error)return {error:t.failedSave};
 revalidatePath('/agent/tasks');revalidatePath('/agent');return {success:t.saved};
}
