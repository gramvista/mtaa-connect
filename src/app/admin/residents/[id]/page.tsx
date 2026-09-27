import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/features/auth/context';
import { locationPath } from '@/features/residents/locations';
import { ResidentForm } from '@/components/admin/resident-form';
import { ActionForm } from '@/components/ui/form';
import { grantResidentAccess,setResidentStatus } from '@/features/residents/actions';
import { adminText as t } from '@/i18n/admin';
import type { Resident } from '@/types/domain';
import { PaymentForm } from '@/components/admin/payment-form';
import { randomUUID } from 'node:crypto';
export default async function EditResident({params}:{params:Promise<{id:string}>}){
 const {db,profile}=await requireAdmin();const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();
 const {data}=await db.from('resident_directory').select('*').eq('id',id).single();if(!data)notFound();
 const resident=data as Resident,path=await locationPath(db,resident.mtaa_id,resident.balozi_area_id);
 return <><h1 className="text-2xl font-bold">{t.editResident}</h1><ResidentForm resident={resident} initialPath={path} superAdmin={profile.role==='super_admin'}/>
 <section className="max-w-3xl rounded-xl border border-primary/30 bg-primary/5 p-5"><h2 className="mb-3 text-lg font-semibold">{t.subscription}</h2><p className="mb-4 text-sm">{resident.subscription_status==='active'?t.residentPaymentComplete:t.residentPaymentRequired}</p>{resident.subscription_status!=='active'&&<div className="space-y-6">{profile.role==='super_admin'&&<ActionForm action={grantResidentAccess} label={t.approveWithoutPayment}><input type="hidden" name="id" value={id}/><p className="text-sm text-muted-foreground">{t.approveWithoutPaymentHelp}</p></ActionForm>}<PaymentForm residentId={id} idempotencyKey={randomUUID()}/></div>}</section>
 <section className="max-w-3xl border-t pt-6"><ActionForm action={setResidentStatus} label={resident.status==='active'?t.suspend:t.restore}><input type="hidden" name="id" value={id}/><input type="hidden" name="status" value={resident.status==='active'?'suspended':'active'}/></ActionForm></section></>;
}
