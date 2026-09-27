'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/features/auth/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { adminText as t } from '@/i18n/admin';
import type { ActionState } from '@/types/domain';

const optionalId=z.union([z.uuid(),z.literal('')]).optional();
// A Super Admin owns platform-wide fields (no Mtaa). Everyone else is scoped to their own Mtaa.
function scopeFor(profile:{role:string;mtaa_id:string|null}){ return profile.role==='super_admin'?null:profile.mtaa_id; }
export async function saveGroupingField(_:ActionState,form:FormData):Promise<ActionState> {
 const {profile}=await requireAdmin();
 const parsed=z.object({name:z.string().trim().min(2).max(80),id:optionalId,status:z.enum(['active','inactive']).default('active')}).safeParse(Object.fromEntries(form));
 if(!parsed.success) return {error:t.invalid};
 const mtaa=scopeFor(profile);
 if(profile.role!=='super_admin'&&!mtaa) return {error:t.invalid};
 const {data,error}=await createAdminClient().rpc('save_grouping_field',{p_actor:profile.id,p_mtaa:mtaa,p_name:parsed.data.name,p_status:parsed.data.status,p_id:parsed.data.id||null});
 if(error) return {error:t.failedSave};
 revalidatePath('/admin/groups'); return {success:t.saved,id:data as string};
}
export async function saveGroupingValue(_:ActionState,form:FormData):Promise<ActionState> {
 const {profile}=await requireAdmin();
 const parsed=z.object({field_id:z.uuid(),name:z.string().trim().min(1).max(80),id:optionalId,status:z.enum(['active','inactive']).default('active')}).safeParse(Object.fromEntries(form));
 if(!parsed.success) return {error:t.invalid};
 const {data,error}=await createAdminClient().rpc('save_grouping_value',{p_actor:profile.id,p_field:parsed.data.field_id,p_name:parsed.data.name,p_status:parsed.data.status,p_id:parsed.data.id||null});
 if(error) return {error:t.failedSave};
 revalidatePath('/admin/groups'); return {success:t.saved,id:data as string};
}
