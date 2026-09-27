import { requireAdmin } from '@/features/auth/context';
import { locationPath } from '@/features/residents/locations';
import { CampaignForm } from '@/components/admin/campaign-form';
import { adminText as t } from '@/i18n/admin';
export default async function NewCampaign(){
 const {db,profile}=await requireAdmin();const path=await locationPath(db,profile.mtaa_id);
 return <><h1 className="text-2xl font-bold">{t.newCampaign}</h1><p className="rounded-xl bg-muted p-4 text-sm">{t.smsDatabaseSource}</p><div className="max-w-3xl"><CampaignForm initialPath={path} lockMtaa={profile.role==='mtaa_admin'}/></div></>;
}
