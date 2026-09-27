import 'server-only';
import { z } from 'zod';
import type { PaymentProvider,VerifiedPayment } from './types';
import { verifyMockSignature } from '../webhook-signature';
import { clickPesaProvider } from './clickpesa';

export function mockEnabled(){return process.env.NODE_ENV!=='production'&&process.env.ALLOW_MOCK_PROVIDERS==='true';}
export function paymentProvider():PaymentProvider {
 const name=process.env.PAYMENT_PROVIDER||'pending';
 if(name==='clickpesa')return clickPesaProvider();
 if(name==='mock'&&mockEnabled()) return {
  name:'mock',
  async initiate(){return {reference:null,status:'pending'};},
  async verifyWebhook(rawBody,headers):Promise<VerifiedPayment>{
   const secret=process.env.PAYMENT_WEBHOOK_SECRET;
   if(!secret||secret.length<32)throw new Error('Missing webhook secret');
   verifyMockSignature(rawBody,headers,secret);
   return z.object({eventId:z.string().min(1).max(120),paymentId:z.uuid(),providerReference:z.string().min(1).max(120),amount:z.literal(3000),currency:z.literal('TZS')}).parse(JSON.parse(rawBody));
  },
 };
 if(name!=='pending')throw new Error('Payment adapter not implemented or mock disabled');
 return {
  name:'pending',async initiate(){return {reference:null,status:'pending'};},
  async verifyWebhook(){throw new Error('Production payment adapter pending official API specification');},
 };
}
