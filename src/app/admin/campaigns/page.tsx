import Link from 'next/link';
import { requireAdmin } from '@/features/auth/context';
import { Status,Pagination,getPage,tableClass } from '@/components/admin/table';
import { Button } from '@/components/ui/button';
import { adminText as t } from '@/i18n/admin';
import type { Campaign } from '@/types/domain';
export default async function Campaigns({searchParams}:{searchParams:Promise<{page?:string}>}){
 const {db}=await requireAdmin();const page=getPage((await searchParams).page);
 const {data,error,count}=await db.from('sms_campaigns').select('id,mtaa_id,title,message,status,total_recipients,units_per_message,sent_count,delivered_count,failed_count,created_at',{count:'exact'}).order('created_at',{ascending:false}).range((page-1)*25,page*25-1);
 if(error)throw new Error(t.unavailable);
 return <><div className="flex items-center justify-between gap-4"><h1 className="text-2xl font-bold">{t.campaigns}</h1><Button asChild><Link href="/admin/campaigns/new">{t.newCampaign}</Link></Button></div>
 <div className="overflow-auto rounded-xl border bg-card"><table className={tableClass}><thead><tr>{[t.title,t.status,t.recipients,t.sent,t.delivered,t.failed].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{(data as Campaign[]).map(c=><tr key={c.id}><td><Link className="underline" href={'/admin/campaigns/'+c.id}>{c.title}</Link></td><td><Status value={c.status}/></td><td>{c.total_recipients}</td><td>{c.sent_count}</td><td>{c.delivered_count}</td><td>{c.failed_count}</td></tr>)}</tbody></table>{!data.length&&<p className="p-5">{t.empty}</p>}</div><Pagination path="/admin/campaigns" page={page} count={count||0}/></>;
}
