'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaff } from './context';
import { adminText as t } from '@/i18n/admin';
import type { ActionState } from '@/types/domain';
import { createHash } from 'node:crypto';

export async function login(_: ActionState, form: FormData): Promise<ActionState> {
 const parsed=z.object({email:z.email().max(254),password:z.string().min(1).max(256)}).safeParse(Object.fromEntries(form));
 if (!parsed.success) return {error:t.invalid};
 let destination='/admin';
 try {
  const service=createAdminClient();
  const key=createHash('sha256').update(parsed.data.email.toLowerCase()).digest('hex');
  const {data:allowed,error:limitError}=await service.rpc('consume_rate_limit',{p_key:'login:'+key,p_limit:10,p_window:900});
  if(limitError) return {error:t.unavailable};
  if(!allowed) return {error:t.rateLimited};
  const client=await createClient();
  const {data,error}=await client.auth.signInWithPassword(parsed.data);
  if(error || !data.user) return {error:t.invalidLogin};
  const {data:profile}=await client.from('profiles').select('id,status,role').eq('id',data.user.id).single();
  if (!profile || profile.status!=='active') {await client.auth.signOut();return {error:t.invalidLogin};}
  await service.from('audit_logs').insert({actor_id:profile.id,action:'administrator.login',entity_type:'profile',entity_id:profile.id});
  destination=profile.role==='agent'?'/agent':'/admin';
 } catch { return {error:t.unavailable}; }
 redirect(destination);
}
export async function logout() {
 const client=await createClient(); await client.auth.signOut(); redirect('/login');
}
export async function changePassword(_:ActionState,form:FormData):Promise<ActionState> {
 const {userClient}=await requireStaff();
 const parsed=z.string().min(8).max(128).safeParse(form.get('password'));
 if(!parsed.success) return {error:t.invalid};
 const {error}=await userClient.auth.updateUser({password:parsed.data});
 return error?{error:t.failedSave}:{success:t.saved};
}
