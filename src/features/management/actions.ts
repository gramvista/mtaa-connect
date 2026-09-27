'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/features/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { adminText as t } from '@/i18n/admin';
import type { ActionState } from '@/types/domain';

const optionalId=z.union([z.uuid(),z.literal('')]).optional();
export async function saveLocation(_:ActionState,form:FormData):Promise<ActionState> {
 const {profile}=await requireAdmin();
 const parsed=z.object({kind:z.enum(['regions','districts','wards','mitaa','balozi_areas','categories']),name:z.string().trim().min(2).max(80),parent:optionalId,id:optionalId,status:z.enum(['active','inactive']).default('active'),balozi_name:z.string().max(120).optional()}).safeParse(Object.fromEntries(form));
 if(!parsed.success) return {error:t.invalid};
 const p=parsed.data;
 const {data,error}=await createAdminClient().rpc('save_location',{p_actor:profile.id,p_kind:p.kind,p_name:p.name,p_parent:p.parent||null,p_id:p.id||null,p_status:p.status,p_balozi_name:p.balozi_name||''});
 if(error) return {error:t.failedSave};
 revalidatePath('/admin/locations'); return {success:t.saved,id:data as string};
}
export async function createAdministrator(_:ActionState,form:FormData):Promise<ActionState> {
 const {profile}=await requireAdmin(true);
 const parsed=z.object({name:z.string().trim().min(2).max(120),email:z.email().max(254),password:z.string().min(8).max(128),mtaa_id:z.uuid(),role:z.enum(['mtaa_admin','agent'])}).safeParse(Object.fromEntries(form));
 if(!parsed.success) return {error:t.invalid};
 const p=parsed.data, db=createAdminClient();
 const {data:tenant}=await db.from('mitaa').select('id').eq('id',p.mtaa_id).eq('status','active').single();
 if(!tenant) return {error:t.invalid};
 const {data,error}=await db.auth.admin.createUser({email:p.email,password:p.password,email_confirm:true});
 if(error || !data.user) return {error:t.failedSave};
 const {error:profileError}=await db.rpc('manage_profile',{p_actor:profile.id,p_id:data.user.id,p_name:p.name,p_mtaa:p.mtaa_id,p_role:p.role});
 if(profileError) {
  // Newly created users with no profile have no data access. Best-effort cleanup.
  await db.auth.admin.deleteUser(data.user.id);
  return {error:t.failedSave};
 }
 revalidatePath('/admin/administrators'); return {success:t.saved};
}
export async function updateAdministrator(_:ActionState,form:FormData):Promise<ActionState> {
 const {profile}=await requireAdmin(true);
 const parsed=z.object({id:z.uuid(),name:z.string().trim().min(2).max(120),mtaa_id:z.uuid(),status:z.enum(['active','suspended']),role:z.enum(['mtaa_admin','agent'])}).safeParse(Object.fromEntries(form));
 if(!parsed.success) return {error:t.invalid};
 const p=parsed.data;
 const {error}=await createAdminClient().rpc('manage_profile',{p_actor:profile.id,p_id:p.id,p_name:p.name,p_mtaa:p.mtaa_id,p_status:p.status,p_role:p.role});
 if(error) return {error:t.failedSave};
 revalidatePath('/admin/administrators');return {success:t.saved};
}
export async function saveWelcomeTemplate(_:ActionState,form:FormData):Promise<ActionState> {
 const {profile}=await requireAdmin(true);
 const parsed=z.string().trim().min(1).max(1000).safeParse(form.get('message'));
 if(!parsed.success) return {error:t.invalid};
 const {error}=await createAdminClient().rpc('save_welcome_template',{p_actor:profile.id,p_message:parsed.data});
 return error?{error:t.failedSave}:{success:t.saved};
}
