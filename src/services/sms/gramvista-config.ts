import { z } from 'zod';

const emptyToUndefined=(value:unknown)=>typeof value==='string'&&value.trim()===''?undefined:value;
export const gramvistaConfigSchema=z.object({
 GRAMVISTA_SMS_API_URL:z.string().trim().transform((value,context)=>{
  try{
   const url=new URL(value);
   const supabase=url.hostname==='sscleaiwktklkuxqqndf.supabase.co'&&url.pathname.replace(/\/$/,'')==='/functions/v1/public-api/v1';
   if(url.protocol!=='https:'||url.port||url.username||url.password||url.search||url.hash||!supabase)throw new Error();
   return url.toString().replace(/\/$/,'');
  }catch{context.addIssue({code:'custom',message:'Invalid Gramvista API URL'});return z.NEVER;}
 }),
 GRAMVISTA_SMS_API_KEY:z.string().trim().regex(/^gvs_(?:test|live)_[A-Za-z0-9_-]{8,}$/),
 GRAMVISTA_SMS_SENDER_ID:z.string().trim().regex(/^[A-Za-z0-9 ]{1,11}$/),
 GRAMVISTA_SMS_WEBHOOK_SECRET:z.preprocess(emptyToUndefined,z.string().min(32).optional()),
});
export type GramvistaConfig=z.infer<typeof gramvistaConfigSchema>;
export function parseGramvistaConfig(input:Record<string,unknown>){
 const result=gramvistaConfigSchema.safeParse(input);
 if(!result.success){
  const fields=[...new Set(result.error.issues.map(issue=>issue.path.join('.')))];
  throw new Error(`Invalid or missing Gramvista configuration: ${fields.join(', ')}`);
 }
 return result.data;
}
