import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/features/auth/context';
import { confirmCampaign } from '@/features/campaigns/actions';
import { ActionForm } from '@/components/ui/form';
import { Card } from '@/components/ui/card';
import { Status,Pagination,getPage,tableClass } from '@/components/admin/table';
import { adminText as t } from '@/i18n/admin';
import type { Campaign } from '@/types/domain';
export default async function CampaignDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{page?:string}>}){
 const {db}=await requireAdmin();const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();const page=getPage((await searchParams).page);
 const {data}=await db.from('sms_campaigns').select('*').eq('id',id).single();if(!data)notFound();const c=data as Campaign;
 const {data:recipientData,error,count}=await db.from('sms_recipients').select('id,phone_number_snapshot,status,sent_at,delivered_at,residents(full_name)',{count:'exact'}).eq('campaign_id',id).order('id').range((page-1)*25,page*25-1);
 if(error)throw new Error(t.unavailable);
 const recipients=recipientData as unknown as {id:string;phone_number_snapshot:string;status:string;sent_at:string|null;delivered_at:string|null;residents:{full_name:string}|null}[];
 return <><h1 className="text-2xl font-bold">{c.title}</h1><Status value={c.status}/><Card><p className="whitespace-pre-wrap">{c.message}</p></Card>
 <div className="grid gap-4 sm:grid-cols-3">{[[t.recipients,c.total_recipients],[t.units,c.total_recipients*c.units_per_message],[t.delivered,c.delivered_count]].map(([label,value])=><Card key={label}><p className="text-sm">{label}</p><p className="mt-3 text-2xl font-bold">{value}</p></Card>)}</div><p className="text-sm text-muted-foreground">{t.costPending}</p>
 {c.status==='draft'&&<ActionForm action={confirmCampaign} label={t.confirm}><input type="hidden" name="id" value={id}/><p className="max-w-3xl text-sm">{t.confirmationHelp}</p></ActionForm>}
 <h2 className="text-lg font-semibold">{t.history}</h2><div className="overflow-auto rounded-xl border bg-card"><table className={tableClass}><thead><tr><th>{t.name}</th><th>{t.phone}</th><th>{t.status}</th><th>{t.sent}</th><th>{t.delivered}</th></tr></thead><tbody>{recipients.map(r=><tr key={r.id}><td>{r.residents?.full_name||'—'}</td><td>{r.phone_number_snapshot}</td><td><Status value={r.status}/></td><td>{r.sent_at?new Date(r.sent_at).toLocaleString('sw-TZ',{timeZone:'Africa/Dar_es_Salaam'}):'—'}</td><td>{r.delivered_at?new Date(r.delivered_at).toLocaleString('sw-TZ',{timeZone:'Africa/Dar_es_Salaam'}):'—'}</td></tr>)}</tbody></table>{!recipients.length&&<p className="p-5">{t.empty}</p>}</div><Pagination path={'/admin/campaigns/'+id} page={page} count={count||0}/></>;
}
