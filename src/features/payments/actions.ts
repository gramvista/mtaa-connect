'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/features/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { paymentProvider } from '@/services/payments/provider';
import { adminText as t } from '@/i18n/admin';
import type { ActionState } from '@/types/domain';
export async function createPayment(_:ActionState,form:FormData):Promise<ActionState>{
 const {db,profile}=await requireAdmin();
 const parsed=z.object({resident_id:z.uuid(),key:z.uuid()}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:t.invalid};
 const {data:resident}=await db.from('residents').select('id,phone_number').eq('id',parsed.data.resident_id).single();
 if(!resident)return {error:t.failedSave};
 try {
  const provider=paymentProvider();
  const {data:id,error}=await createAdminClient().rpc('create_payment',{p_actor:profile.id,p_resident:resident.id,p_provider:provider.name,p_key:parsed.data.key});
  if(error)return {error:t.failedSave};
  await provider.initiate({id,residentId:resident.id,phone:resident.phone_number,amount:3000,currency:'TZS',idempotencyKey:parsed.data.key});
  revalidatePath('/admin/subscriptions');return {success:provider.name==='mock'?t.mockNotice:t.paymentPending,id};
 } catch{return {error:t.unavailable};}
}
