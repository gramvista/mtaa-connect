import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPublicEnv } from '@/config/env';
import type { Profile } from '@/types/domain';

const activeProfile=cache(async function activeProfile() {
 try { getPublicEnv(); } catch { redirect('/login'); }
 const userClient = await createClient();
 const { data: { user }, error } = await userClient.auth.getUser();
 if (error || !user) redirect('/login');
 const { data } = await userClient.from('profiles').select('id,full_name,email,role,mtaa_id,status').eq('id',user.id).single();
 const profile = data as Profile | null;
 if (!profile || profile.status !== 'active') redirect('/login?error=unauthorized');
 if (!['super_admin','mtaa_admin','agent'].includes(profile.role)) redirect('/login?error=unauthorized');
 return {profile,userClient};
});
const adminContext=cache(async function adminContext(superOnly:boolean) {
 const {profile,userClient}=await activeProfile();
 if (profile.role === 'agent') redirect('/agent');
 if (superOnly && profile.role !== 'super_admin') redirect('/admin');
 if (profile.role === 'mtaa_admin') {
  const { data: tenant } = await userClient.from('mitaa').select('id').eq('id',profile.mtaa_id!).eq('status','active').single();
  if (!tenant) redirect('/login?error=unauthorized');
 }
 return { profile, userClient, db: profile.role === 'super_admin' ? createAdminClient() : userClient };
});
export async function requireAdmin(superOnly = false) {return adminContext(superOnly);}
const agentContext=cache(async function agentContext() {
 const {profile,userClient}=await activeProfile();
 if(profile.role!=='agent'||!profile.mtaa_id)redirect(profile.role==='agent'?'/login?error=unauthorized':'/admin');
 const db=createAdminClient();
 const {data:mtaa}=await db.from('mitaa').select('id,name,status').eq('id',profile.mtaa_id).eq('status','active').single();
 if(!mtaa)redirect('/login?error=unauthorized');
 const {data:assignments}=await db.from('agent_mtaa_assignments').select('id,agent_id,mtaa_id,status,mitaa(name)').eq('agent_id',profile.id).eq('status','active').order('created_at').limit(100);
 return {profile,userClient,db,mtaa,assignments:assignments||[]};
});
export async function requireAgent() {return agentContext();}
export async function requireStaff() { return activeProfile(); }
export function assertTenant(profile: Profile, tenant: string) {
 if (profile.role !== 'super_admin' && profile.mtaa_id !== tenant) throw new Error('Forbidden');
}
