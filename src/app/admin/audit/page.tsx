import { requireAdmin } from '@/features/auth/context';
import { Pagination,getPage,tableClass } from '@/components/admin/table';
import { adminText as t } from '@/i18n/admin';
export default async function Audit({searchParams}:{searchParams:Promise<{page?:string}>}){
 const {db,profile}=await requireAdmin();const page=getPage((await searchParams).page);
 let query=db.from('audit_logs').select('id,action,entity_type,created_at,profiles(full_name)',{count:'exact'}).order('created_at',{ascending:false}).range((page-1)*25,page*25-1);
 if(profile.role==='mtaa_admin')query=query.eq('actor_id',profile.id).eq('mtaa_id',profile.mtaa_id!);
 const {data,error,count}=await query;
 if(error)throw new Error(t.unavailable);
 const rows=data as unknown as {id:string;action:string;entity_type:string;created_at:string;profiles:{full_name:string}|null}[];
 return <><h1 className="text-2xl font-bold">{t.audit}</h1><div className="overflow-auto rounded-xl border bg-card"><table className={tableClass}><thead><tr><th>{t.created}</th><th>{t.name}</th><th>{t.auditAction}</th><th>{t.entity}</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{new Date(r.created_at).toLocaleString('sw-TZ',{timeZone:'Africa/Dar_es_Salaam'})}</td><td>{r.profiles?.full_name||'—'}</td><td>{r.action}</td><td>{r.entity_type}</td></tr>)}</tbody></table>{!rows.length&&<p className="p-5">{t.empty}</p>}</div><Pagination path="/admin/audit" page={page} count={count||0}/></>;
}
