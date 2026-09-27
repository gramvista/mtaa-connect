import 'server-only';
import { createCipheriv,createDecipheriv,randomBytes } from 'node:crypto';

function key(){
 const value=process.env.SMS_CREDENTIAL_ENCRYPTION_KEY;
 if(!value)throw new Error('SMS credential encryption is not configured');
 const decoded=Buffer.from(value,'base64');
 if(decoded.length!==32)throw new Error('SMS credential encryption key must decode to 32 bytes');
 return decoded;
}
export function encryptSmsSecret(value:string,context:string){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
 cipher.setAAD(Buffer.from(context));
 const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),encrypted].map(part=>part.toString('base64url')).join('.');
}
export function decryptSmsSecret(value:string,context:string){
 const parts=value.split('.').map(part=>Buffer.from(part,'base64url'));
 if(parts.length!==3||parts[0].length!==12||parts[1].length!==16)throw new Error('Invalid encrypted SMS credential');
 const decipher=createDecipheriv('aes-256-gcm',key(),parts[0]);
 decipher.setAAD(Buffer.from(context));decipher.setAuthTag(parts[1]);
 return Buffer.concat([decipher.update(parts[2]),decipher.final()]).toString('utf8');
}
