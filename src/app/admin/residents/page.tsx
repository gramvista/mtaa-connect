import Link from 'next/link';
import { z } from 'zod';
import { requireAdmin } from '@/features/auth/context';
import { ResidentFilters } from '@/components/admin/resident-filters';
import { Button } from '@/components/ui/button';
import { Status,Pagination,getPage,tableClass } from '@/components/admin/table';
import { adminText as t } from '@/i18n/admin';
import type { Resident } from '@/types/domain';
import { locationPath } from '@/features/residents/locations';
export default async function Residents({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const {db,profile}=await requireAdmin();const raw=await searchParams;
 const params=Object.fromEntries(Object.entries(raw).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
 const columns='id,full_name,phone_number,mtaa_id,balozi_area_id,status,registration_status,category_ids,category_names,occupation_codes,occupation_names,occupation_other,group_value_ids,group_names,subscription_status,expires_at,region_name,district_name,ward_name,mtaa_name,balozi_name,balozi_area_name,balozi_leader_name';
 const page=getPage(params.page);let query=db.from('resident_directory').select(columns,{count:'exact'}).order('region_name').order('district_name').order('ward_name').order('mtaa_name').order('balozi_area_name').order('full_name').order('id').range((page-1)*25,page*25-1);
 const q=(params.q||'').replace(/[^\p{L}\p{N}+\s-]/gu,'').trim().slice(0,80);
 if(q)query=query.or(`full_name.ilike.%${q}%,phone_number.ilike.%${q}%`);
 for(const [key,column] of [['mtaa','mtaa_id'],['balozi','balozi_area_id']])if(z.uuid().safeParse(params[key]).success)query=query.eq(column,params[key]);
 if(z.uuid().safeParse(params.category).success)query=query.contains('category_ids',[params.category]);
 if(z.uuid().safeParse(params.group).success)query=query.contains('group_value_ids',[params.group]);
 if(['active','pending','expired'].includes(params.subscription))query=query.eq('subscription_status',params.subscription);
 if(['approved','pending','rejected'].includes(params.registration))query=query.eq('registration_status',params.registration);
 const {data,error,count}=await query;if(error)throw new Error(t.unavailable);const rows=data as unknown as Resident[];
 const initialPath=await locationPath(db,profile.mtaa_id);
 return <><div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-bold">{t.residents}</h1><Button asChild><Link href="/admin/residents/new">{t.newResident}</Link></Button></div><ResidentFilters values={params} initialPath={initialPath} lockMtaa={profile.role==='mtaa_admin'}/>
 <div className="overflow-auto rounded-xl border bg-card"><table className={tableClass}><thead><tr>{[t.region,t.district,t.ward,t.mtaa,t.baloziAreaName,t.baloziName,t.name,t.phone,t.categories,t.occupations,t.residentGroups,t.subscription,t.expiry,t.registration,t.status,t.actions].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.region_name}</td><td>{r.district_name}</td><td>{r.ward_name}</td><td>{r.mtaa_name}</td><td>{r.balozi_area_name||t.notProvided}</td><td>{r.balozi_leader_name||t.notProvided}</td><td className="font-medium">{r.full_name}</td><td className="whitespace-nowrap">{r.phone_number}</td><td>{r.category_names}</td><td>{r.occupation_names||'—'}</td><td>{r.group_names||'—'}</td><td><Status value={r.subscription_status}/></td><td>{r.expires_at?new Date(r.expires_at).toLocaleDateString('sw-TZ',{timeZone:'Africa/Dar_es_Salaam'}):'—'}</td><td><Status value={r.registration_status}/></td><td><Status value={r.status}/></td><td><Link className="underline" href={'/admin/residents/'+r.id}>{t.edit}</Link></td></tr>)}</tbody></table>{!rows.length&&<p className="p-6">{t.empty}</p>}</div>
 <Pagination path="/admin/residents" page={page} count={count||0} params={params}/></>;
}
