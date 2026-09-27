import { loadEnvConfig } from '@next/env';
import { createHmac, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parseClickPesaConfig } from '../src/services/payments/clickpesa-config';

loadEnvConfig(process.cwd(), true);

async function main() {
 const config=parseClickPesaConfig(process.env);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const suppliedPhone=process.argv[2]?.replace(/[\s()+-]/g,'');
 const {data:resident,error}=suppliedPhone
  ? {data:{phone_number:suppliedPhone.startsWith('255')?`+${suppliedPhone}`:`+255${suppliedPhone.replace(/^0/,'')}`},error:null}
  : await db.from('residents').select('phone_number').order('created_at',{ascending:false}).limit(1).single();
 if(error||!resident||!/^\+255[67]\d{8}$/.test(resident.phone_number))throw new Error('Provide a valid Tanzanian phone for the non-charging preview');
 const tokenResponse=await fetch(`${config.CLICKPESA_API_BASE_URL}/generate-token`,{method:'POST',headers:{'client-id':config.CLICKPESA_CLIENT_ID,'api-key':config.CLICKPESA_API_KEY},signal:AbortSignal.timeout(20_000)});
 if(!tokenResponse.ok)throw new Error(`ClickPesa authentication returned HTTP ${tokenResponse.status}`);
 const tokenBody=z.object({success:z.literal(true),token:z.string().min(1)}).parse(await tokenResponse.json());
 const payload={amount:'3000',currency:'TZS',fetchSenderDetails:true,orderReference:`AV${randomBytes(8).toString('hex').toUpperCase()}`,phoneNumber:resident.phone_number.replace(/^\+/, '')};
 const canonical=Object.keys(payload).sort().reduce<Record<string,unknown>>((result,key)=>{result[key]=payload[key as keyof typeof payload];return result;},{});
 const checksum=config.CLICKPESA_CHECKSUM_KEY?createHmac('sha256',config.CLICKPESA_CHECKSUM_KEY).update(JSON.stringify(canonical)).digest('hex'):undefined;
 const requestBody=checksum?{...payload,checksum}:payload;
 const previewResponse=await fetch(`${config.CLICKPESA_API_BASE_URL}/payments/preview-ussd-push-request`,{method:'POST',headers:{authorization:/^Bearer\s/i.test(tokenBody.token)?tokenBody.token:`Bearer ${tokenBody.token}`,'content-type':'application/json'},body:JSON.stringify(requestBody),signal:AbortSignal.timeout(25_000)});
 if(!previewResponse.ok)throw new Error(`ClickPesa preview returned HTTP ${previewResponse.status}`);
 const preview=z.object({activeMethods:z.array(z.object({name:z.string(),status:z.string()})),sender:z.object({accountProvider:z.string()}).optional()}).passthrough().parse(await previewResponse.json());
 console.log(JSON.stringify({api:'reachable',preview:'accepted',senderProvider:preview.sender?.accountProvider??'unknown',methods:preview.activeMethods},null,2));
}

main().catch((error)=>{console.error(error instanceof Error?error.message:'Availability check failed');process.exitCode=1;});
