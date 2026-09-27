import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/features/auth/context';
import { locationPath } from '@/features/residents/locations';
import { AdministratorForm } from '@/components/admin/administrator-form';
import { Card } from '@/components/ui/card';
import { Status,tableClass } from '@/components/admin/table';
import { adminText as t } from '@/i18n/admin';
import type { Profile } from '@/types/domain';
export default async function EditAdministrator({params}:{params:Promise<{id:string}>}){
 const {db,profile:actor}=await requireAdmin(true);const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();
 const {data}=await db.from('profiles').select('*').eq('id',id).in('role',['mtaa_admin','agent']).single();if(!data)notFound();
 const profile=data as Profile,path=await locationPath(db,profile.mtaa_id);
 const summary=profile.role==='agent'?(await db.rpc('agent_commission_summary',{p_actor:actor.id,p_agent:profile.id})).data as {registrations:number;successful_registrations:number;pending_payments:number;earned_total:number;paid_total:number;balance:number}|null:null;
 const commissions=profile.role==='agent'?(await db.from('agent_commissions').select('id,amount,status,earned_at,paid_at').eq('agent_id',profile.id).order('earned_at',{ascending:false}).limit(25)).data||[]:[];
 return <><h1 className="text-2xl font-bold">{t.administrators}</h1><div className="max-w-2xl"><AdministratorForm profile={profile} initialPath={path}/></div>{summary&&<><h2 className="text-lg font-semibold">{t.commission}</h2><p className="text-sm text-muted-foreground">{t.commissionRate}</p><div className="grid gap-4 sm:grid-cols-3">{[[t.registrations,summary.registrations],[t.successfulRegistrations,summary.successful_registrations],[t.pendingPayments,summary.pending_payments],[t.earnedTotal,`TSh ${summary.earned_total.toLocaleString()}`],[t.paidTotal,`TSh ${summary.paid_total.toLocaleString()}`],[t.commissionBalance,`TSh ${summary.balance.toLocaleString()}`]].map(([label,value])=><Card key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></Card>)}</div><div className="overflow-auto rounded-xl border"><table className={tableClass}><thead><tr><th>{t.amount}</th><th>{t.status}</th><th>{t.created}</th></tr></thead><tbody>{commissions.map(item=><tr key={item.id}><td>TSh {item.amount.toLocaleString()}</td><td><Status value={item.status}/></td><td>{new Date(item.earned_at).toLocaleDateString('sw-TZ',{timeZone:'Africa/Dar_es_Salaam'})}</td></tr>)}</tbody></table>{!commissions.length&&<p className="p-5">{t.noCommissionYet}</p>}</div></>}</>;
}
