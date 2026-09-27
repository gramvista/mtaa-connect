import Link from 'next/link';
import { requireAdmin } from '@/features/auth/context';
import { AdministratorForm } from '@/components/admin/administrator-form';
import { Status,Pagination,getPage,tableClass } from '@/components/admin/table';
import { adminText as t } from '@/i18n/admin';
import type { Profile } from '@/types/domain';
export default async function Administrators({searchParams}:{searchParams:Promise<{page?:string}>}){
 const {db}=await requireAdmin(true);const page=getPage((await searchParams).page);
 const {data,error,count}=await db.from('profiles').select('*',{count:'exact'}).in('role',['mtaa_admin','agent']).order('created_at',{ascending:false}).range((page-1)*25,page*25-1);
 if(error)throw new Error(t.unavailable);
 return <><h1 className="text-2xl font-bold">{t.agentsAndAdmins}</h1><p className="text-sm">{t.agentHelp}</p>
 <details className="max-w-2xl rounded-xl border bg-card p-5"><summary className="cursor-pointer font-medium">{t.createAdmin}</summary><div className="mt-5"><AdministratorForm initialPath={{region:'',district:'',ward:'',mtaa:'',balozi:''}}/></div></details>
 <div className="overflow-auto"><table className={tableClass}><thead><tr><th>{t.name}</th><th>{t.role}</th><th>{t.status}</th><th>{t.actions}</th></tr></thead><tbody>{(data as Profile[]).map(p=><tr key={p.id}><td>{p.full_name}</td><td>{t[p.role]}</td><td><Status value={p.status}/></td><td><Link className="underline" href={'/admin/administrators/'+p.id}>{t.edit}</Link></td></tr>)}</tbody></table></div>
 {!data.length&&<p>{t.empty}</p>}<Pagination path="/admin/administrators" page={page} count={count||0}/></>;
}
