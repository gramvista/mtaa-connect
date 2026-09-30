import { requireAdmin } from '@/features/auth/context';
import { locationPath } from '@/features/residents/locations';
import { ResidentForm } from '@/components/admin/resident-form';
import { adminText as t } from '@/i18n/admin';
export default async function NewResident(){
 const {db,profile}=await requireAdmin();
 const [path,occupations]=await Promise.all([locationPath(db,profile.mtaa_id),db.from('occupations').select('code,name,requires_detail,sort_order').eq('status','active').order('sort_order').limit(100)]);
 if(occupations.error)throw new Error(t.unavailable);
 return <><h1 className="text-2xl font-bold">{t.newResident}</h1><ResidentForm initialPath={path} occupations={occupations.data??[]} superAdmin={profile.role==='super_admin'}/></>;
}
