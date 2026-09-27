import 'server-only';
import { cookies } from 'next/headers';
import { createHash,randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const cookieName='mtaa_registration';
export const hash = (value:string)=>createHash('sha256').update(value).digest('hex');
export async function registrationToken(create=false){
 const jar=await cookies();
 const existing=jar.get(cookieName)?.value;
 if(existing&&/^[a-f0-9]{64}$/.test(existing))return hash(existing);
 if(!create)return null;
 return issueRegistrationToken(jar);
}
function issueRegistrationToken(jar:Awaited<ReturnType<typeof cookies>>){
 const token=randomBytes(32).toString('hex');
 jar.set(cookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/register',maxAge:604800});
 return hash(token);
}
export async function replaceRegistrationToken(){
 return issueRegistrationToken(await cookies());
}
export async function clearRegistrationToken(){
 const jar=await cookies();
 jar.delete(cookieName);
}
export type Receipt={payment_id:string;resident_id:string;phone:string;provider:string;idempotency_key:string;payment_status:string;registration_status:string;mtaa:string;amount:3000;currency:'TZS';expires_at:string|null};
export async function registrationReceipt():Promise<Receipt|null>{
 const token=await registrationToken();
 if(!token)return null;
 const {data,error}=await createAdminClient().rpc('public_registration_receipt',{p_token:token});
 if(error)throw new Error('Receipt unavailable');
 return data as Receipt|null;
}
export async function consumeLimit(key:string,limit:number,window=900){
 const {data,error}=await createAdminClient().rpc('consume_rate_limit',{p_key:key,p_limit:limit,p_window:window});
 if(error)throw new Error('Rate limiter unavailable');
 return data===true;
}
