import { requireAdmin } from '@/features/auth/context';
import { locationPath } from '@/features/residents/locations';
import { CampaignForm } from '@/components/admin/campaign-form';
import { adminText as t } from '@/i18n/admin';
import { createAdminClient } from '@/lib/supabase/admin';
export default async function NewCampaign(){
 const {db,profile}=await requireAdmin();const path=await locationPath(db,profile.mtaa_id);
 const quota=profile.mtaa_id?(await createAdminClient().rpc('mtaa_campaign_quota',{p_actor:profile.id,p_mtaa:profile.mtaa_id})).data as null|{limit:number;used:number;remaining:number;period_ends_at:string;applies:boolean}:null;
 return <><h1 className="text-2xl font-bold">{t.newCampaign}</h1>{quota&&(quota.applies?<p className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">{t.officialSmsActive}. {t.campaignAllowance}: <strong>{quota.remaining}</strong> / {quota.limit}. {t.periodEnds}: {new Date(quota.period_ends_at).toLocaleDateString('sw-TZ',{timeZone:'Africa/Dar_es_Salaam'})}</p>:<p className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">{t.ownSmsUnlimited}</p>)}<p className="rounded-xl bg-muted p-4 text-sm">{t.smsDatabaseSource}</p><div className="max-w-3xl"><CampaignForm initialPath={path} lockMtaa={profile.role==='mtaa_admin'}/></div></>;
}
