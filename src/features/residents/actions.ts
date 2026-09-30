'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin, assertTenant } from '@/features/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { residentSchema } from './schema';
import { adminText as t } from '@/i18n/admin';
import type { ActionState } from '@/types/domain';

export async function saveResident(input:unknown):Promise<ActionState> {
 const {profile}=await requireAdmin();
 const parsed=residentSchema.safeParse(input);
 if(!parsed.success) return {error:t.invalid};
 const r=parsed.data;
 try {
  assertTenant(profile,r.mtaa_id);
  const {data,error}=await createAdminClient().rpc('save_resident',{
   p_actor:profile.id,p_mtaa:r.mtaa_id,p_balozi:r.balozi_area_id||null,p_name:r.full_name,p_phone:r.phone_number,
   p_categories:r.category_ids,p_approved:r.approved,p_consent:r.consent,p_id:r.id||null,p_groups:r.group_values,
  });
  if(error) return {error:error.code==='23505'?t.duplicate:t.failedSave};
  revalidatePath('/admin'); revalidatePath('/admin/residents');
  return {success:t.saved,id:data as string};
 } catch {return {error:t.failedSave};}
}
export async function setResidentStatus(_:ActionState,form:FormData):Promise<ActionState> {
 const {profile}=await requireAdmin();
 const parsed=z.object({id:z.uuid(),status:z.enum(['active','suspended'])}).safeParse(Object.fromEntries(form));
 if(!parsed.success) return {error:t.invalid};
 const {error}=await createAdminClient().rpc('set_resident_status',{p_actor:profile.id,p_id:parsed.data.id,p_status:parsed.data.status});
 if(error) return {error:t.failedSave};
 revalidatePath('/admin/residents');redirect('/admin/residents');
}
export async function grantResidentAccess(_:ActionState,form:FormData):Promise<ActionState> {
 const {profile}=await requireAdmin();
 const parsed=z.object({id:z.uuid()}).safeParse(Object.fromEntries(form));
 if(!parsed.success||profile.role!=='super_admin')return {error:t.invalid};
 const {error}=await createAdminClient().rpc('grant_resident_access',{p_actor:profile.id,p_resident:parsed.data.id});
 if(error)return {error:t.failedSave};
 revalidatePath('/admin');revalidatePath('/admin/residents');revalidatePath(`/admin/residents/${parsed.data.id}`);
 return {success:t.residentAccessGranted};
}
export async function deleteResidentPermanently(_:ActionState,form:FormData):Promise<ActionState> {
 const {profile}=await requireAdmin(true);
 const parsed=z.object({id:z.uuid(),confirmation:z.string().trim().min(2).max(120)}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:t.invalid};
 const db=createAdminClient();
 const {data:resident,error:lookupError}=await db.from('residents').select('id,full_name').eq('id',parsed.data.id).maybeSingle();
 if(lookupError||!resident)return {error:t.deleteResidentFailed};
 if(parsed.data.confirmation!==resident.full_name)return {error:t.deleteResidentConfirmationMismatch};
 const {error}=await db.rpc('delete_resident_permanently',{p_actor:profile.id,p_resident:resident.id});
 if(error)return {error:t.deleteResidentFailed};
 revalidatePath('/admin');revalidatePath('/admin/residents');revalidatePath('/admin/subscriptions');
 redirect('/admin/residents');
}
