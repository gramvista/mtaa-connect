import { requireAdmin } from '@/features/auth/context';
import { locationPath } from '@/features/residents/locations';
import { ResidentForm } from '@/components/admin/resident-form';
import { adminText as t } from '@/i18n/admin';
export default async function NewResident(){
 const {db,profile}=await requireAdmin();
 const path=await locationPath(db,profile.mtaa_id);
 return <><h1 className="text-2xl font-bold">{t.newResident}</h1><ResidentForm initialPath={path} superAdmin={profile.role==='super_admin'}/></>;
}
