import { createHmac,timingSafeEqual } from 'node:crypto';

// This is our development adapter contract, NOT an invented production provider contract.
export function verifyMockSignature(body:string,headers:Headers,secret:string,now=Date.now()) {
 const timestamp=headers.get('x-mtaa-timestamp')||'';
 const signature=headers.get('x-mtaa-signature')||'';
 if(!/^\d{10}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300||!/^[a-f0-9]{64}$/i.test(signature))throw new Error('Invalid signature');
 const expected=createHmac('sha256',secret).update(timestamp+'.'+body).digest();
 if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw new Error('Invalid signature');
}
