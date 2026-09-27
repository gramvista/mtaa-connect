import Link from 'next/link';
import { requireAdmin } from '@/features/auth/context';
import { Status,Pagination,getPage,tableClass } from '@/components/admin/table';
import { adminText as t } from '@/i18n/admin';
export default async function Subscriptions({searchParams}:{searchParams:Promise<{page?:string}>}){
 const {db}=await requireAdmin();const page=getPage((await searchParams).page);
 const {data,error,count}=await db.from('payments').select('id,resident_id,amount,currency,provider,provider_reference,status,created_at,residents(full_name)',{count:'exact'}).order('created_at',{ascending:false}).range((page-1)*25,page*25-1);
 if(error)throw new Error(t.unavailable);
 const rows=data as unknown as {id:string;resident_id:string;amount:number;currency:string;provider:string;provider_reference:string|null;status:string;created_at:string;residents:{full_name:string}|null}[];
 return <><h1 className="text-2xl font-bold">{t.subscriptions}</h1><p>{t.subscriptionHelp}</p><p className="rounded-xl border bg-muted p-4 text-sm">{t.paymentPending}</p>
 <Link className="text-sm underline" href="/admin/residents?subscription=active">{t.activeSubscribers}</Link>
 <div className="overflow-auto rounded-xl border bg-card"><table className={tableClass}><thead><tr>{[t.name,t.amount,t.provider,t.reference,t.paymentStatus,t.created].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{rows.map(p=><tr key={p.id}><td><Link className="underline" href={'/admin/residents/'+p.resident_id}>{p.residents?.full_name||'—'}</Link></td><td>{p.amount.toLocaleString()} {p.currency}</td><td>{p.provider}</td><td>{p.provider_reference||'—'}</td><td><Status value={p.status}/></td><td>{new Date(p.created_at).toLocaleDateString('sw-TZ',{timeZone:'Africa/Dar_es_Salaam'})}</td></tr>)}</tbody></table>{!rows.length&&<p className="p-5">{t.empty}</p>}</div><Pagination path="/admin/subscriptions" page={page} count={count||0}/></>;
}
