import { createHmac } from 'node:crypto';
import { describe,expect,it,vi } from 'vitest';

vi.mock('server-only',()=>({}));
import { gramvistaProvider,verifyGramvistaAccount } from './gramvista';
import { parseGramvistaConfig } from './gramvista-config';
import { decryptSmsSecret,encryptSmsSecret } from './credentials';

const env={
 GRAMVISTA_SMS_API_URL:'https://sscleaiwktklkuxqqndf.supabase.co/functions/v1/public-api/v1',
 GRAMVISTA_SMS_API_KEY:'gvs_test_1234567890',
 GRAMVISTA_SMS_SENDER_ID:'MTAACONNECT',
 GRAMVISTA_SMS_WEBHOOK_SECRET:'test-webhook-secret-that-is-at-least-32-characters',
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

describe('Gramvista SMS provider',()=>{
 it('encrypts Mtaa-owned credentials with tenant-bound authenticated encryption',()=>{
  const previous=process.env.SMS_CREDENTIAL_ENCRYPTION_KEY;
  process.env.SMS_CREDENTIAL_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
  try{
   const encrypted=encryptSmsSecret('gvs_test_private','mtaa-1:api-key');
   expect(encrypted).not.toContain('gvs_test_private');
   expect(decryptSmsSecret(encrypted,'mtaa-1:api-key')).toBe('gvs_test_private');
   expect(()=>decryptSmsSecret(encrypted,'mtaa-2:api-key')).toThrow();
  }finally{if(previous===undefined)delete process.env.SMS_CREDENTIAL_ENCRYPTION_KEY;else process.env.SMS_CREDENTIAL_ENCRYPTION_KEY=previous;}
 });
 it('locks credentials to the official API origins without leaking supplied values',()=>{
  expect(parseGramvistaConfig(env).GRAMVISTA_SMS_SENDER_ID).toBe('MTAACONNECT');
  expect(()=>parseGramvistaConfig({...env,GRAMVISTA_SMS_API_URL:'https://attacker.example/v1'})).toThrow('GRAMVISTA_SMS_API_URL');
  try{parseGramvistaConfig({...env,GRAMVISTA_SMS_API_KEY:''});expect.fail('missing key should fail');}
  catch(error){expect((error as Error).message).toContain('GRAMVISTA_SMS_API_KEY');expect((error as Error).message).not.toContain(env.GRAMVISTA_SMS_API_KEY);}
 });
 it('verifies the wallet and approved Sender ID before accepting Mtaa credentials',async()=>{
  const fetcher=vi.fn(async(input:URL|RequestInfo)=>String(input).endsWith('/balance')
   ?json({available_sms:100,reserved_sms:5,total_sms:105})
   :json({data:[{sender_name:'MTAACONNECT',status:'approved'}]})) as unknown as typeof fetch;
  await expect(verifyGramvistaAccount({env,fetcher})).resolves.toEqual({balance:{available_sms:100,reserved_sms:5,total_sms:105},senderId:'MTAACONNECT'});
  const pending=vi.fn(async(input:URL|RequestInfo)=>String(input).endsWith('/balance')
   ?json({available_sms:100,reserved_sms:0,total_sms:100})
   :json({data:[{sender_name:'MTAACONNECT',status:'pending'}]})) as unknown as typeof fetch;
  await expect(verifyGramvistaAccount({env,fetcher:pending})).rejects.toThrow('not approved');
 });
 it('queues one message idempotently and resolves its stable message reference',async()=>{
  const calls:Array<{url:string;init?:RequestInit}>=[];
  const fetcher=vi.fn(async(input:URL|RequestInfo,init?:RequestInit)=>{
   const url=String(input);calls.push({url,init});
   if(url.endsWith('/messages')&&init?.method==='POST')return json({success:true,message_batch_id:'gvs_cmp_1',campaign_id:'10000000-0000-4000-8000-000000000001',status:'queued'});
   if(url.endsWith('/campaigns/gvs_cmp_1/messages'))return json({data:[{message_reference:'gvs_msg_1',status:'queued'}]});
   return json({},500);
  }) as unknown as typeof fetch;
  const provider=gramvistaProvider({env,fetcher});
  await expect(provider.sendSingleSMS({idempotencyKey:'local-recipient-1',phone:'+255712345678',message:'Taarifa ya mtaa'})).resolves.toEqual({providerMessageId:'gvs_msg_1',status:'sent'});
  const sent=JSON.parse(String(calls[0].init?.body));
  expect(sent).toEqual({sender_id:'MTAACONNECT',recipients:['+255712345678'],message:'Taarifa ya mtaa'});
  expect(new Headers(calls[0].init?.headers).get('idempotency-key')).toBe('local-recipient-1');
  expect(new Headers(calls[0].init?.headers).get('authorization')).toBe(`Bearer ${env.GRAMVISTA_SMS_API_KEY}`);
 });
 it('marks deterministic API rejection as safe to fail without retry',async()=>{
  const provider=gramvistaProvider({env,fetcher:vi.fn(async()=>json({error:{code:'SENDER_ID_NOT_APPROVED'}},400)) as unknown as typeof fetch});
  await expect(provider.sendSingleSMS({idempotencyKey:'id-1',phone:'+255712345678',message:'Test'})).rejects.toMatchObject({ambiguous:false});
 });
 it('verifies signed delivery callbacks and rejects altered bodies',async()=>{
  const provider=gramvistaProvider({env});
  const body=JSON.stringify({id:'gvs_msg_1:delivered',type:'message.delivered',data:{id:'gvs_msg_1',status:'delivered'}});
  const timestamp=Math.floor(Date.now()/1000).toString();
  const signature=createHmac('sha256',env.GRAMVISTA_SMS_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex');
  const headers=new Headers({'x-gramvista-signature':`t=${timestamp},v1=${signature}`});
  await expect(provider.processDeliveryWebhook(body,headers)).resolves.toEqual({providerMessageId:'gvs_msg_1',status:'delivered'});
  await expect(provider.processDeliveryWebhook(body+' ',headers)).rejects.toThrow('signature');
 });
});
