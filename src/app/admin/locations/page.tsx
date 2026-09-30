import { z } from 'zod';
import { requireAdmin } from '@/features/auth/context';
import { locationPath } from '@/features/residents/locations';
import { LocationManagement } from '@/components/admin/location-management';
import { ActionForm,inputClass } from '@/components/ui/form';
import { saveLocation } from '@/features/management/actions';
import { Pagination,getPage,Status } from '@/components/admin/table';
import { adminText as t } from '@/i18n/admin';
import type { Location } from '@/types/domain';
export default async function Locations({searchParams}:{searchParams:Promise<Record<string,string>>}){
 const {db,profile}=await requireAdmin();const params=await searchParams;const isSuper=profile.role==='super_admin';
 const valid=['regions','districts','wards','mitaa','balozi_areas','categories'];
 const kind=valid.includes(params.kind)?params.kind:(isSuper?'regions':'balozi_areas');
 const initial=await locationPath(db,profile.mtaa_id);
 for(const key of ['region','district','ward','mtaa','balozi'] as const)if(z.uuid().safeParse(params[key]).success)initial[key]=params[key];
 const parent=z.uuid().safeParse(params.parent).success?params.parent:(!isSuper?profile.mtaa_id:null);
 const columns:Record<string,string>={districts:'region_id',wards:'district_id',mitaa:'ward_id',balozi_areas:'mtaa_id',categories:'mtaa_id'};
 const page=getPage(params.page);let query=db.from(kind).select('*',{count:'exact'}).order('name').order('id').range((page-1)*25,page*25-1);
 if(columns[kind])query=parent?query.eq(columns[kind],parent):query.is(columns[kind],null);
 const {data,error,count}=await query;if(error)throw new Error(t.unavailable);const rows=data as Location[];
 return <><h1 className="text-2xl font-bold">{t.locations}</h1><p className="text-sm text-muted-foreground">{t.locationHelp}</p><LocationManagement superAdmin={isSuper} initialPath={initial} initialKind={kind}/>
 <div className="grid gap-4 sm:grid-cols-2">{rows.map(row=><div className="rounded-xl border bg-card p-4" key={row.id}>
 {kind==='balozi_areas'&&<div className="mb-4 rounded-lg bg-muted p-3"><p className="text-xs font-medium text-muted-foreground">{t.baloziAreaName}</p><p className="font-semibold">{row.name}</p><p className="mt-2 text-xs font-medium text-muted-foreground">{t.baloziName}</p><p>{row.balozi_name||t.notProvided}</p></div>}
 {['mitaa','balozi_areas','categories'].includes(kind)&&(isSuper||row.mtaa_id===profile.mtaa_id)?<ActionForm action={saveLocation}>
  <input type="hidden" name="id" value={row.id}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="parent" value={parent||''}/>
  <label className="block text-sm">{kind==='balozi_areas'?t.baloziAreaName:t.locationName}<input className={inputClass} name="name" defaultValue={row.name} required maxLength={80}/></label>
  {kind==='balozi_areas'&&<label className="block text-sm">{t.baloziName}<input name="balozi_name" className={inputClass} defaultValue={row.balozi_name} maxLength={120}/></label>}
  <label className="block text-sm">{t.status}<select className={inputClass} name="status" defaultValue={row.status}><option value="active">{t.active}</option><option value="inactive">{t.inactive}</option></select></label>
 </ActionForm>:<><p className="font-medium">{row.name}</p>{kind==='balozi_areas'&&<p className="text-sm text-muted-foreground">{t.baloziName}: {row.balozi_name||t.notProvided}</p>}{row.status&&<Status value={row.status}/>}</>}
 </div>)}</div>{!rows.length&&<p>{t.empty}</p>}<Pagination path="/admin/locations" page={page} count={count||0} params={params}/></>;
}
