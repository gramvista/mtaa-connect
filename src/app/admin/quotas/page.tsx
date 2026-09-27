import { requireAdmin } from '@/features/auth/context';
import { ActionForm,inputClass } from '@/components/ui/form';
import { tableClass } from '@/components/admin/table';
import { setMtaaCampaignLimit } from '@/features/management/actions';
import { adminText as t } from '@/i18n/admin';

type Quota={limit:number;used:number;remaining:number;period_ends_at:string};
export default async function CampaignQuotas(){
 const {db,profile}=await requireAdmin(true);
 const {data,error}=await db.from('mitaa').select('id,name,status').order('name').limit(1000);
 if(error)throw new Error(t.unavailable);
 const rows=await Promise.all(data.map(async mtaa=>{
  const result=await db.rpc('mtaa_campaign_quota',{p_actor:profile.id,p_mtaa:mtaa.id});
  if(result.error)throw new Error(t.unavailable);
  return {...mtaa,quota:result.data as Quota};
 }));
 return <><div><h1 className="text-2xl font-bold">{t.campaignQuotas}</h1><p className="mt-1 text-sm text-muted-foreground">{t.campaignQuotaHelp}</p></div>
  <div className="overflow-auto rounded-xl border bg-card"><table className={tableClass}><thead><tr><th>{t.mtaa}</th><th>{t.campaignUsage}</th><th>{t.campaignRemaining}</th><th>{t.periodEnds}</th><th>{t.actions}</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.name}</td><td>{row.quota.used} / {row.quota.limit}</td><td>{row.quota.remaining}</td><td>{new Date(row.quota.period_ends_at).toLocaleDateString('sw-TZ',{timeZone:'Africa/Dar_es_Salaam'})}</td><td><ActionForm action={setMtaaCampaignLimit} label={t.increaseLimit} className="flex min-w-56 items-end gap-2"><input type="hidden" name="mtaa_id" value={row.id}/><label className="text-xs">{t.campaignLimit}<input className={inputClass} type="number" name="limit" min={1} max={10000} defaultValue={row.quota.limit} required/></label></ActionForm></td></tr>)}</tbody></table></div></>;
}
