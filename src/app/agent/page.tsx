import Link from 'next/link';
import { requireAgent } from '@/features/auth/context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Status,tableClass } from '@/components/admin/table';
import { adminText as t } from '@/i18n/admin';

type Stats={registrations:number;successful_registrations:number;pending_payments:number;earned_total:number;paid_total:number;balance:number};
type RecentPayment={id:string;status:string;created_at:string;residents:{full_name:string;phone_number:string;registration_status:string}|null};
export default async function AgentDashboard({searchParams}:{searchParams:Promise<{registered?:string}>}){
 const {profile,db}=await requireAgent();
 const [{data:stats,error:statsError},{data:recent,error:recentError}]=await Promise.all([
  db.rpc('agent_commission_summary',{p_actor:profile.id,p_agent:profile.id}),
  db.from('payments').select('id,status,created_at,residents(full_name,phone_number,registration_status)').eq('agent_id',profile.id).order('created_at',{ascending:false}).limit(10),
 ]);
 if(statsError||recentError)throw new Error(t.unavailable);
 const s=stats as Stats,rows=recent as unknown as RecentPayment[];
 return <><div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-bold">{t.agentDashboard}</h1><Button asChild><Link href="/agent/register">{t.agentRegister}</Link></Button></div>
  {(await searchParams).registered==='1'&&<p role="status" className="rounded-lg bg-muted p-4">{t.agentPaymentPending}</p>}
  <p className="text-sm text-muted-foreground">{t.commissionRate}</p>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[[t.registrations,s.registrations],[t.successfulRegistrations,s.successful_registrations],[t.pendingPayments,s.pending_payments],[t.earnedTotal,`TSh ${s.earned_total.toLocaleString()}`],[t.paidTotal,`TSh ${s.paid_total.toLocaleString()}`],[t.commissionBalance,`TSh ${s.balance.toLocaleString()}`]].map(([label,value])=><Card key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-2xl font-bold">{value}</p></Card>)}</div>
  <section><h2 className="mb-3 text-lg font-semibold">{t.ownRegistrations}</h2><div className="overflow-auto rounded-xl border bg-card"><table className={tableClass}><thead><tr><th>{t.name}</th><th>{t.phone}</th><th>{t.registration}</th><th>{t.paymentStatus}</th><th>{t.created}</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.residents?.full_name}</td><td>{row.residents?.phone_number}</td><td><Status value={row.residents?.registration_status||'pending'}/></td><td><Status value={row.status}/></td><td>{new Date(row.created_at).toLocaleDateString('sw-TZ',{timeZone:'Africa/Dar_es_Salaam'})}</td></tr>)}</tbody></table>{!rows.length&&<p className="p-5">{t.empty}</p>}</div></section>
 </>;
}
