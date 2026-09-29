'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/features/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { adminText as t } from '@/i18n/admin';
import type { ActionState } from '@/types/domain';
import { administratorValidationError,createAdministratorSchema,updateAdministratorSchema } from './administrator-validation';

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
 const parsed=createAdministratorSchema.safeParse(Object.fromEntries(form));
 if(!parsed.success) return {error:administratorValidationError(parsed.error)};
 const p=parsed.data, db=createAdminClient();
 const {data:tenant}=await db.from('mitaa').select('id').eq('id',p.mtaa_id).eq('status','active').single();
 if(!tenant) return {error:t.invalidAdministratorMtaa};
 const {data,error}=await db.auth.admin.createUser({email:p.email,password:p.password,email_confirm:true});
 if(error || !data.user) return {error:t.failedSave};
 const {error:profileError}=await db.rpc('manage_profile',{p_actor:profile.id,p_id:data.user.id,p_name:p.name,p_mtaa:p.mtaa_id,p_role:p.role});
 if(profileError) {
  // Newly created users with no profile have no data access. Best-effort cleanup.
  await db.auth.admin.deleteUser(data.user.id);
  return {error:t.failedSave};
 }
 await db.from('profiles').update({email:p.email.toLowerCase()}).eq('id',data.user.id);
 if(p.role==='agent')await db.rpc('assign_agent_mtaa',{p_actor:profile.id,p_agent:data.user.id,p_mtaa:p.mtaa_id,p_active:true});
 revalidatePath('/admin/administrators'); return {success:t.saved};
}
export async function updateAdministrator(_:ActionState,form:FormData):Promise<ActionState> {
 const {profile}=await requireAdmin(true);
 const parsed=updateAdministratorSchema.safeParse(Object.fromEntries(form));
 if(!parsed.success) return {error:administratorValidationError(parsed.error)};
 const p=parsed.data;
 const db=createAdminClient();
 const {error:authError}=await db.auth.admin.updateUserById(p.id,{email:p.email,email_confirm:true});
 if(authError)return {error:t.failedSave};
 const {error}=await db.rpc('manage_profile',{p_actor:profile.id,p_id:p.id,p_name:p.name,p_mtaa:p.mtaa_id,p_status:p.status,p_role:p.role});
 if(error) return {error:t.failedSave};
 await db.from('profiles').update({email:p.email.toLowerCase()}).eq('id',p.id);
 if(p.role==='agent')await db.rpc('assign_agent_mtaa',{p_actor:profile.id,p_agent:p.id,p_mtaa:p.mtaa_id,p_active:true});
 revalidatePath('/admin/administrators');return {success:t.saved};
}
export async function setAdministratorStatus(_:ActionState,form:FormData):Promise<ActionState>{
 const {profile}=await requireAdmin(true);const parsed=z.object({id:z.uuid(),status:z.enum(['active','suspended'])}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:t.invalid};const db=createAdminClient();
 const {data:target}=await db.from('profiles').select('id,full_name,mtaa_id,role').eq('id',parsed.data.id).in('role',['mtaa_admin','agent']).single();
 if(!target)return {error:t.invalid};
 const {error}=await db.rpc('manage_profile',{p_actor:profile.id,p_id:target.id,p_name:target.full_name,p_mtaa:target.mtaa_id,p_status:parsed.data.status,p_role:target.role});
 if(error)return {error:t.failedSave};revalidatePath('/admin/administrators');return {success:t.saved};
}
export async function setAgentAssignment(_:ActionState,form:FormData):Promise<ActionState>{
 const {profile}=await requireAdmin(true);const parsed=z.object({agent_id:z.uuid(),mtaa_id:z.uuid(),active:z.enum(['true','false'])}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:t.invalid};const {error}=await createAdminClient().rpc('assign_agent_mtaa',{p_actor:profile.id,p_agent:parsed.data.agent_id,p_mtaa:parsed.data.mtaa_id,p_active:parsed.data.active==='true'});
 if(error)return {error:t.failedSave};revalidatePath(`/admin/administrators/${parsed.data.agent_id}`);return {success:t.saved};
}
export async function createAgentTask(_:ActionState,form:FormData):Promise<ActionState>{
 const {profile}=await requireAdmin(true);const parsed=z.object({agent_id:z.uuid(),title:z.string().trim().min(2).max(160),description:z.string().trim().max(2000).default(''),priority:z.enum(['low','normal','high']),due_at:z.string().optional(),mtaa_ids:z.array(z.uuid()).min(1)}).safeParse({agent_id:form.get('agent_id'),title:form.get('title'),description:form.get('description')||'',priority:form.get('priority'),due_at:form.get('due_at')?.toString()||undefined,mtaa_ids:form.getAll('mtaa_ids')});
 if(!parsed.success)return {error:t.invalid};const p=parsed.data;const {error}=await createAdminClient().rpc('create_agent_task',{p_actor:profile.id,p_agent:p.agent_id,p_title:p.title,p_description:p.description,p_priority:p.priority,p_due_at:p.due_at?new Date(p.due_at).toISOString():null,p_mitaa:p.mtaa_ids});
 if(error)return {error:t.failedSave};revalidatePath('/admin/tasks');return {success:t.saved};
}
export async function updateTaskStatus(_:ActionState,form:FormData):Promise<ActionState>{
 const {profile}=await requireAdmin(true);const parsed=z.object({id:z.uuid(),status:z.enum(['pending','in_progress','completed','cancelled'])}).safeParse(Object.fromEntries(form));if(!parsed.success)return {error:t.invalid};
 const {error}=await createAdminClient().rpc('set_agent_task_status',{p_actor:profile.id,p_task:parsed.data.id,p_status:parsed.data.status});if(error)return {error:t.failedSave};revalidatePath('/admin/tasks');return {success:t.saved};
}
export async function markCommissionPaid(_:ActionState,form:FormData):Promise<ActionState>{
 const {profile}=await requireAdmin(true);const id=z.uuid().safeParse(form.get('id'));if(!id.success)return {error:t.invalid};const {error}=await createAdminClient().rpc('mark_agent_commission_paid',{p_actor:profile.id,p_commission:id.data});if(error)return {error:t.failedSave};revalidatePath('/admin/administrators');return {success:t.saved};
}
export async function saveWelcomeTemplate(_:ActionState,form:FormData):Promise<ActionState> {
 const {profile}=await requireAdmin(true);
 const parsed=z.string().trim().min(1).max(1000).safeParse(form.get('message'));
 if(!parsed.success) return {error:t.invalid};
 const {error}=await createAdminClient().rpc('save_welcome_template',{p_actor:profile.id,p_message:parsed.data});
 return error?{error:t.failedSave}:{success:t.saved};
}
export async function setMtaaCampaignLimit(_:ActionState,form:FormData):Promise<ActionState> {
 const {profile}=await requireAdmin(true);
 const parsed=z.object({mtaa_id:z.uuid(),limit:z.coerce.number().int().min(1).max(10000)}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:t.invalid};
 const {error}=await createAdminClient().rpc('set_mtaa_campaign_limit',{p_actor:profile.id,p_mtaa:parsed.data.mtaa_id,p_limit:parsed.data.limit});
 if(error)return {error:t.failedSave};
 revalidatePath('/admin/quotas');revalidatePath('/admin');return {success:t.saved};
}
