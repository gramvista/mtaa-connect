import Link from 'next/link';
import { requireAdmin } from '@/features/auth/context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminText as t } from '@/i18n/admin';
import { Status,tableClass } from '@/components/admin/table';
import type { Campaign } from '@/types/domain';
export default async function Dashboard(){
 const {db}=await requireAdmin();
 const results=await Promise.all([
  db.from('residents').select('id',{count:'exact',head:true}),
  db.from('resident_directory').select('id',{count:'exact',head:true}).eq('subscription_status','active'),
  db.from('residents').select('id',{count:'exact',head:true}).eq('registration_status','pending'),
  db.from('mitaa').select('id',{count:'exact',head:true}),
  db.from('sms_campaigns').select('*').order('created_at',{ascending:false}).limit(5),
 ]);
 if(results.some(r=>r.error)) throw new Error(t.unavailable);
 const campaigns=results[4].data as Campaign[];
 return <><div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-bold">{t.dashboard}</h1><Button asChild><Link href="/admin/residents/new">{t.newResident}</Link></Button></div>
 <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[t.totalResidents,t.activeSubscribers,t.pendingRegistrations,t.totalMitaa].map((label,i)=><Card key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-3xl font-bold">{results[i].count??0}</p></Card>)}</div>
 <Card><h2 className="mb-4 text-lg font-semibold">{t.recent}</h2>{!campaigns.length?<p>{t.empty}</p>:<div className="overflow-auto"><table className={tableClass}><thead><tr><th>{t.title}</th><th>{t.status}</th><th>{t.recipients}</th><th>{t.delivered}</th></tr></thead><tbody>{campaigns.map(c=><tr key={c.id}><td><Link className="underline" href={'/admin/campaigns/'+c.id}>{c.title}</Link></td><td><Status value={c.status}/></td><td>{c.total_recipients}</td><td>{c.delivered_count}</td></tr>)}</tbody></table></div>}</Card>
 <p className="text-sm text-muted-foreground">{t.security}</p></>;
}
