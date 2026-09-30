import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/features/auth/context';
import { locationPath } from '@/features/residents/locations';
import { ResidentForm } from '@/components/admin/resident-form';
import { ActionForm } from '@/components/ui/form';
import { deleteResidentPermanently,grantResidentAccess,setResidentStatus } from '@/features/residents/actions';
import { adminText as t } from '@/i18n/admin';
import type { Resident } from '@/types/domain';
import { PaymentForm } from '@/components/admin/payment-form';
import { randomUUID } from 'node:crypto';
export default async function EditResident({params}:{params:Promise<{id:string}>}){
 const {db,profile}=await requireAdmin();const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();
 const [{data,error},occupations]=await Promise.all([db.from('resident_directory').select('*').eq('id',id).single(),db.from('occupations').select('code,name,requires_detail,sort_order').eq('status','active').order('sort_order').limit(100)]);if(error||!data)notFound();
 if(occupations.error)throw new Error(t.unavailable);
 const resident=data as Resident,path=await locationPath(db,resident.mtaa_id,resident.balozi_area_id);
 return <><h1 className="text-2xl font-bold">{t.editResident}</h1><section className="max-w-3xl rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">{t.locationSummary}</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{[[t.region,resident.region_name],[t.district,resident.district_name],[t.ward,resident.ward_name],[t.mtaa,resident.mtaa_name],[t.baloziAreaName,resident.balozi_area_name||t.notProvided],[t.baloziName,resident.balozi_leader_name||t.notProvided],[t.occupations,resident.occupation_names||t.notProvided]].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl></section><ResidentForm resident={resident} initialPath={path} occupations={occupations.data??[]} superAdmin={profile.role==='super_admin'}/>
 <section className="max-w-3xl rounded-xl border border-primary/30 bg-primary/5 p-5"><h2 className="mb-3 text-lg font-semibold">{t.subscription}</h2><p className="mb-4 text-sm">{resident.subscription_status==='active'?t.residentPaymentComplete:t.residentPaymentRequired}</p>{resident.subscription_status!=='active'&&<div className="space-y-6">{profile.role==='super_admin'&&<ActionForm action={grantResidentAccess} label={t.approveWithoutPayment}><input type="hidden" name="id" value={id}/><p className="text-sm text-muted-foreground">{t.approveWithoutPaymentHelp}</p></ActionForm>}<PaymentForm residentId={id} idempotencyKey={randomUUID()}/></div>}</section>
 <section className="max-w-3xl border-t pt-6"><ActionForm action={setResidentStatus} label={resident.status==='active'?t.suspend:t.restore}><input type="hidden" name="id" value={id}/><input type="hidden" name="status" value={resident.status==='active'?'suspended':'active'}/></ActionForm></section>
 {profile.role==='super_admin'&&<section className="max-w-3xl rounded-xl border border-destructive/40 bg-destructive/5 p-5"><h2 className="text-lg font-semibold text-destructive">{t.deleteResidentPermanently}</h2><p className="mt-2 text-sm">{t.deleteResidentHelp}</p><ActionForm className="mt-4 space-y-4" action={deleteResidentPermanently} label={t.deletePermanently} confirmMessage={t.confirmPermanentResidentDelete}><input type="hidden" name="id" value={id}/><label className="block text-sm">{t.typeResidentName}<input className="mt-1 block min-h-11 w-full rounded-lg border bg-background px-3 py-2" name="confirmation" autoComplete="off" required placeholder={resident.full_name}/></label></ActionForm></section>}</>;
}
