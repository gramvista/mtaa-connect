'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/features/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { smsUnits } from '@/services/sms/units';
import { processSmsQueue } from '@/services/sms/queue';
import { adminText as t } from '@/i18n/admin';
import type { ActionState } from '@/types/domain';
export async function previewCampaign(_:ActionState,form:FormData):Promise<ActionState>{
 const {profile}=await requireAdmin();
 const optionalId=z.union([z.uuid(),z.literal('')]).optional();
 const parsed=z.object({mtaa_id:z.uuid(),title:z.string().trim().min(2).max(120),message:z.string().trim().min(1).max(1000),type:z.enum(['all','balozi','category','balozi_category','group','selected']),balozi:optionalId,category:optionalId,group_field:optionalId,group_value:optionalId,selected:z.string().max(19000).optional()}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:t.invalid};
 const p=parsed.data;
 if(p.type==='group'&&(!p.group_field||!p.group_value))return {error:t.invalid};
 const selected=z.array(z.uuid()).max(500).safeParse((p.selected||'').split(',').map(s=>s.trim()).filter(Boolean));
 if(!selected.success)return {error:t.invalid};
 const {data,error}=await createAdminClient().rpc('preview_campaign',{p_actor:profile.id,p_mtaa:p.mtaa_id,p_title:p.title,p_message:p.message,p_type:p.type,p_balozi:p.balozi||null,p_category:p.category||null,p_selected:selected.data,p_units:smsUnits(p.message),p_group_field:p.group_field||null,p_group_value:p.group_value||null});
 if(error)return {error:t.failedSave};
 redirect('/admin/campaigns/'+data);
}
export async function confirmCampaign(_:ActionState,form:FormData):Promise<ActionState>{
 const {profile}=await requireAdmin();const parsed=z.uuid().safeParse(form.get('id'));if(!parsed.success)return {error:t.invalid};
 const {error}=await createAdminClient().rpc('confirm_campaign',{p_actor:profile.id,p_id:parsed.data});
 if(error)return {error:error.message.includes('Mtaa campaign limit reached')?t.campaignLimitReached:t.failedSave};
 try{await processSmsQueue(25);}catch{return {error:t.smsQueuedRetry};}
 revalidatePath('/admin/campaigns/'+parsed.data);return {success:t.smsSubmitted};
}
export async function processQueuedMessages():Promise<ActionState>{
 await requireAdmin();
 try{
  const processed=await processSmsQueue(25);
  revalidatePath('/admin');revalidatePath('/admin/campaigns');
  return {success:processed?`${t.smsProcessed} ${processed}`:t.smsQueueEmpty};
 }catch{return {error:t.smsQueueFailed};}
}
