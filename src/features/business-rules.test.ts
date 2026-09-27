import { describe,expect,it } from 'vitest';
import { createHmac } from 'node:crypto';
import { normalizePhone,phoneSchema,residentSchema } from './residents/schema';
import { registrationSchema } from './registration/schema';
import { agentRegistrationSchema } from './agents/schema';
import { smsUnits } from '../services/sms/units';
import { verifyMockSignature } from '../services/webhook-signature';
describe('registration and provider boundaries',()=>{
 it('keeps agent commission and approval fields out of agent registration input',()=>{
  const id='10000000-0000-4000-8000-000000000001';
  const input={mtaa_id:id,balozi_area_id:'',full_name:'Agent Resident',phone_number:'0712345678',payment_phone:'0689123456',category_ids:[id],group_values:[],consent:true,key:id};
  expect(agentRegistrationSchema.parse(input).phone_number).toBe('+255712345678');
  expect(agentRegistrationSchema.parse(input).payment_phone).toBe('+255689123456');
  expect(agentRegistrationSchema.safeParse({...input,approved:true}).success).toBe(false);
  expect(agentRegistrationSchema.safeParse({...input,commission:300}).success).toBe(false);
 });
 it('rejects public approval, identity, payment and honeypot fields',()=>{
  const id='10000000-0000-4000-8000-000000000001';
  const input={mtaa_id:id,balozi_area_id:id,full_name:'Asha Juma',phone_number:'0712345678',category_ids:[id],consent:true};
  expect(registrationSchema.parse(input).phone_number).toBe('+255712345678');
  for(const forged of [{approved:true},{id},{amount:1},{payment_status:'successful'},{website:'spam'}]){
   expect(registrationSchema.safeParse({...input,...forged}).success).toBe(false);
  }
 });
 it.each(['0712345678','255712345678','+255 712 345 678'])('normalizes %s',phone=>expect(normalizePhone(phone)).toBe('+255712345678'));
 it('accepts a separate normalized mobile-money payer number',()=>{
  expect(phoneSchema.parse('0689 123 456')).toBe('+255689123456');
  expect(phoneSchema.safeParse('12345').success).toBe(false);
 });
 it('requires consent and rejects too many categories',()=>{
  const id='10000000-0000-4000-8000-000000000001';
  const data={mtaa_id:id,balozi_area_id:id,full_name:'Asha Juma',phone_number:'0712345678',category_ids:[id],consent:true,approved:false};
  expect(residentSchema.safeParse(data).success).toBe(true);
  expect(residentSchema.safeParse({...data,consent:false}).success).toBe(false);
  expect(residentSchema.safeParse({...data,category_ids:[id,id,id]}).success).toBe(false);
 });
 it('counts GSM extension characters and Unicode SMS segments',()=>{
  expect(smsUnits('a'.repeat(160))).toBe(1);expect(smsUnits('a'.repeat(161))).toBe(2);
  expect(smsUnits('^'.repeat(81))).toBe(2);expect(smsUnits('漢'.repeat(71))).toBe(2);
 });
 it('rejects forged, expired and altered development callbacks',()=>{
  const secret='test-secret-that-is-more-than-32-characters',timestamp='1800000000',body='{"amount":3000}';
  const signature=createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex');
  const headers=new Headers({'x-mtaa-timestamp':timestamp,'x-mtaa-signature':signature});
  expect(()=>verifyMockSignature(body,headers,secret,1800000000000)).not.toThrow();
  expect(()=>verifyMockSignature(body+' ',headers,secret,1800000000000)).toThrow();
  expect(()=>verifyMockSignature(body,headers,secret,1800000400000)).toThrow();
 });
});
