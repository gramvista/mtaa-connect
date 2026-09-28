import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
loadEnvConfig(process.cwd());
async function main(){
 const env=z.object({NEXT_PUBLIC_SUPABASE_URL:z.url(),SUPABASE_SERVICE_ROLE_KEY:z.string().min(1),IMPORT_ACTOR_ID:z.uuid()}).safeParse(process.env);
 if(!env.success||!process.argv[2])throw new Error('Configure server credentials and IMPORT_ACTOR_ID, then pass a reviewed JSON file path.');
 const name=z.string().trim().min(2).max(80);
 const rows=z.array(z.object({region:name,district:name,ward:name,mtaa:name,balozi:name,balozi_name:z.string().max(120).optional()})).min(1).max(100000).parse(JSON.parse(readFileSync(process.argv[2],'utf8')));
 const db=createClient(env.data.NEXT_PUBLIC_SUPABASE_URL,env.data.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:actor}=await db.from('profiles').select('id').eq('id',env.data.IMPORT_ACTOR_ID).eq('role','super_admin').eq('status','active').single();
 if(!actor)throw new Error('An active Super Admin actor is required.');
 for(const row of rows){
  let parent:string|null=null;
  const levels=[['regions','region',null],['districts','district','region_id'],['wards','ward','district_id'],['mitaa','mtaa','ward_id'],['balozi_areas','balozi','mtaa_id']] as const;
  for(const [table,key,parentColumn] of levels){
   let query=db.from(table).select('id').eq('name',row[key]);if(parentColumn)query=query.eq(parentColumn,parent!);
   const {data:existing,error:readError}=await query.maybeSingle();if(readError)throw new Error('Location lookup failed; import stopped.');
   if(existing){parent=existing.id;continue;}
   const result=await db.rpc('save_location',{p_actor:actor.id,p_kind:table,p_name:row[key],p_parent:parent,p_balozi_name:key==='balozi'?row.balozi_name||'':''});
   if(result.error)throw new Error('Location import stopped. Completed rows remain; rerun safely after fixing the source.');
   parent=result.data as string;
  }
 }
 console.log(`Imported/reused hierarchy for ${rows.length} reviewed rows. No residents were imported.`);
}
main().catch(()=>{console.error('Import failed. Check JSON structure, active Super Admin actor and database configuration. No source values were logged.');process.exitCode=1;});
