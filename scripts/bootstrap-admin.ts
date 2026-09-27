import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
loadEnvConfig(process.cwd());
async function main(){
 const parsed=z.object({NEXT_PUBLIC_SUPABASE_URL:z.url(),SUPABASE_SERVICE_ROLE_KEY:z.string().min(1),BOOTSTRAP_ADMIN_EMAIL:z.email(),BOOTSTRAP_ADMIN_PASSWORD:z.string().min(8).max(128),BOOTSTRAP_ADMIN_NAME:z.string().trim().min(2).max(120)}).safeParse(process.env);
 if(!parsed.success)throw new Error('Set the Supabase server key and BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_NAME in .env.local.');
 const env=parsed.data,db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {count,error}=await db.from('profiles').select('id',{count:'exact',head:true}).eq('role','super_admin');
 if(error)throw new Error('Cannot read profiles. Check credentials and apply migrations first.');
 if(count)throw new Error('A Super Admin already exists; bootstrap refused.');
 const {data,error:authError}=await db.auth.admin.createUser({email:env.BOOTSTRAP_ADMIN_EMAIL,password:env.BOOTSTRAP_ADMIN_PASSWORD,email_confirm:true});
 if(authError||!data.user)throw new Error('Could not create administrator. Check whether the email already has an Auth account.');
 const {error:profileError}=await db.rpc('bootstrap_super_admin',{p_user:data.user.id,p_name:env.BOOTSTRAP_ADMIN_NAME});
 if(profileError){await db.auth.admin.deleteUser(data.user.id);throw new Error('Bootstrap failed. Newly created Auth user cleanup attempted.');}
 console.log('Super Admin created. Sign in at /login. Remove bootstrap credentials from .env.local.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Bootstrap failed');process.exitCode=1;});
