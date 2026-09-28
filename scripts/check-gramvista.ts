import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { z } from 'zod';
import { parseGramvistaConfig } from '../src/services/sms/gramvista-config';

loadEnvConfig(process.cwd(), true);

const balanceSchema=z.object({
 available_sms:z.coerce.number().int().nonnegative(),
 reserved_sms:z.coerce.number().int().nonnegative(),
 total_sms:z.coerce.number().int().nonnegative(),
});

const sendersSchema=z.object({
 data:z.array(z.object({sender_name:z.string(),status:z.string()}).passthrough()),
});

async function readJson(url:string,apiKey:string){
 const response=await fetch(url,{headers:{accept:'application/json',authorization:`Bearer ${apiKey}`},cache:'no-store',signal:AbortSignal.timeout(20_000)});
 if(!response.ok)throw new Error(`Gramvista readiness request returned HTTP ${response.status}`);
 return response.json() as Promise<unknown>;
}

async function main(){
 const config=parseGramvistaConfig(process.env);
 const [balanceBody,sendersBody]=await Promise.all([
  readJson(`${config.GRAMVISTA_SMS_API_URL}/balance`,config.GRAMVISTA_SMS_API_KEY),
  readJson(`${config.GRAMVISTA_SMS_API_URL}/sender-ids`,config.GRAMVISTA_SMS_API_KEY),
 ]);
 const balance=balanceSchema.parse(balanceBody);
 const senders=sendersSchema.parse(sendersBody).data;
 const configured=senders.find((sender)=>sender.sender_name.toUpperCase()===config.GRAMVISTA_SMS_SENDER_ID.toUpperCase());
 if(!configured)throw new Error('The configured Gramvista Sender ID does not belong to this organization');
 if(configured.status!=='approved')throw new Error(`The configured Gramvista Sender ID is ${configured.status}, not approved`);
 console.log(JSON.stringify({api:'reachable',authentication:'accepted',senderId:configured.sender_name,senderStatus:configured.status,balance},null,2));
}

main().catch((error)=>{console.error(error instanceof Error?error.message:'Gramvista readiness check failed');process.exitCode=1;});
