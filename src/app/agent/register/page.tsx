import { randomUUID } from 'node:crypto';
import { requireAgent } from '@/features/auth/context';
import { AgentRegistrationForm } from '@/components/agent/agent-registration-form';
import { adminText as t } from '@/i18n/admin';
import type { GroupingField,GroupingValue,Location } from '@/types/domain';

export default async function AgentRegister(){
 const {profile,db,mtaa}=await requireAgent();
 const [areasResult,categoriesResult,fieldsResult]=await Promise.all([
  db.from('balozi_areas').select('id,name').eq('mtaa_id',profile.mtaa_id!).eq('status','active').order('name').limit(500),
  db.from('categories').select('id,name,mtaa_id').or(`mtaa_id.is.null,mtaa_id.eq.${profile.mtaa_id}`).eq('status','active').order('name').limit(500),
  db.from('grouping_fields').select('*').or(`mtaa_id.is.null,mtaa_id.eq.${profile.mtaa_id}`).eq('status','active').order('name').limit(100),
 ]);
 if(areasResult.error||categoriesResult.error||fieldsResult.error)throw new Error(t.unavailable);
 const fields=(fieldsResult.data||[]) as GroupingField[];
 const valuesResult=fields.length?await db.from('grouping_values').select('*').in('field_id',fields.map(field=>field.id)).eq('status','active').order('name').limit(1000):{data:[],error:null};
 if(valuesResult.error)throw new Error(t.unavailable);
 return <><h1 className="text-2xl font-bold">{t.agentRegister}</h1><p className="text-sm text-muted-foreground">{t.agentRegistrationHelp}</p><div className="max-w-3xl"><AgentRegistrationForm mtaaId={profile.mtaa_id!} mtaaName={mtaa.name} keyValue={randomUUID()} balozi={(areasResult.data||[]) as Location[]} categories={(categoriesResult.data||[]) as Location[]} fields={fields} values={(valuesResult.data||[]) as GroupingValue[]}/></div></>;
}
