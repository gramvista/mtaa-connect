import { randomUUID } from 'node:crypto';
import { requireAgent } from '@/features/auth/context';
import { AgentRegistrationForm } from '@/components/agent/agent-registration-form';
import { adminText as t } from '@/i18n/admin';
import type { GroupingField,GroupingValue,Location,Occupation } from '@/types/domain';

export default async function AgentRegister({searchParams}:{searchParams:Promise<{mtaa?:string}>}){
 const {profile,db,mtaa,assignments}=await requireAgent();const requested=(await searchParams).mtaa;const selected=assignments.find(a=>a.mtaa_id===requested)||assignments.find(a=>a.mtaa_id===profile.mtaa_id)||assignments[0];const mtaaId=selected?.mtaa_id||profile.mtaa_id!;const assignmentName=(value:unknown)=>Array.isArray(value)?(value[0] as {name?:string}|undefined)?.name:(value as {name?:string}|null)?.name;const mtaaName=assignmentName(selected?.mitaa)||mtaa.name;
 const [areasResult,categoriesResult,fieldsResult,occupationsResult]=await Promise.all([
  db.from('balozi_areas').select('id,name,balozi_name').eq('mtaa_id',mtaaId).eq('status','active').order('name').order('balozi_name').limit(500),
  db.from('categories').select('id,name,mtaa_id').or(`mtaa_id.is.null,mtaa_id.eq.${mtaaId}`).eq('status','active').order('name').limit(500),
  db.from('grouping_fields').select('id,mtaa_id,name,status').or(`mtaa_id.is.null,mtaa_id.eq.${mtaaId}`).eq('status','active').order('name').limit(100),
  db.from('occupations').select('code,name,requires_detail,sort_order').eq('status','active').order('sort_order').limit(100),
 ]);
 if(areasResult.error||categoriesResult.error||fieldsResult.error||occupationsResult.error)throw new Error(t.unavailable);
 const fields=(fieldsResult.data||[]) as GroupingField[];
 const valuesResult=fields.length?await db.from('grouping_values').select('id,field_id,name,status').in('field_id',fields.map(field=>field.id)).eq('status','active').order('name').limit(1000):{data:[],error:null};
 if(valuesResult.error)throw new Error(t.unavailable);
 return <><h1 className="text-2xl font-bold">{t.agentRegister}</h1><p className="text-sm text-muted-foreground">{t.agentRegistrationHelp}</p>{assignments.length>1&&<form className="max-w-md"><label className="text-sm">{t.mtaa}<select className="mt-1 block min-h-11 w-full rounded-lg border bg-background px-3" name="mtaa" defaultValue={mtaaId}>{assignments.map(a=><option key={a.mtaa_id} value={a.mtaa_id}>{assignmentName(a.mitaa)}</option>)}</select></label><button className="mt-2 min-h-11 rounded-lg bg-primary px-4 text-primary-foreground">{t.select}</button></form>}<div className="max-w-3xl"><AgentRegistrationForm mtaaId={mtaaId} mtaaName={mtaaName} keyValue={randomUUID()} balozi={(areasResult.data||[]) as Location[]} categories={(categoriesResult.data||[]) as Location[]} occupations={(occupationsResult.data||[]) as Occupation[]} fields={fields} values={(valuesResult.data||[]) as GroupingValue[]}/></div></>;
}
