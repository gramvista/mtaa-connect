import Link from 'next/link';
import { requireAdmin } from '@/features/auth/context';
import { ActionForm,inputClass } from '@/components/ui/form';
import { saveGroupingField,saveGroupingValue } from '@/features/groupings/actions';
import { Status,tableClass } from '@/components/admin/table';
import { adminText as t } from '@/i18n/admin';
import type { GroupingField,GroupingValue } from '@/types/domain';
export const dynamic='force-dynamic';
export default async function Groups({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const {db,profile}=await requireAdmin();const params=await searchParams;
 const isSuper=profile.role==='super_admin';
 const {data:fieldData,error:fieldError}=await db.from('grouping_fields').select('id,mtaa_id,name,status').order('name').limit(500);
 if(fieldError)throw new Error(t.unavailable);
 const fields=(fieldData||[]) as GroupingField[];
 const selected=fields.find(field=>field.id===params.field)||null;
 const values=selected?(await db.from('grouping_values').select('id,field_id,name,status').eq('field_id',selected.id).order('name').limit(500)).data as GroupingValue[]||[]:[];
 const canManage=(field:GroupingField)=>isSuper?field.mtaa_id===null:field.mtaa_id===profile.mtaa_id;
 return <><div><h1 className="text-2xl font-bold">{t.groupings}</h1><p className="mt-1 text-sm text-muted-foreground">{t.groupingFieldHelp}</p></div>
 <div className="grid gap-6 lg:grid-cols-2">
  <section className="space-y-4 rounded-xl border bg-card p-4"><h2 className="font-semibold">{t.groupingNewField}</h2>
   <ActionForm action={saveGroupingField} label={t.save}><label className="block text-sm">{t.groupingField}<input className={inputClass} name="name" required minLength={2} maxLength={80}/></label></ActionForm>
   <ul className="divide-y">{fields.map(field=><li key={field.id} className="py-3">
    <div className="flex flex-wrap items-center gap-2"><Link className="font-medium underline" href={'/admin/groups?field='+field.id}>{field.name}</Link>{field.mtaa_id===null&&<span className="rounded bg-muted px-2 py-0.5 text-xs">{t.global}</span>}<Status value={field.status}/></div>
    {canManage(field)&&<ActionForm action={saveGroupingField} label={t.save} className="mt-3 space-y-3"><input type="hidden" name="id" value={field.id}/>
     <label className="block text-sm">{t.groupingField}<input className={inputClass} name="name" defaultValue={field.name} required minLength={2} maxLength={80}/></label>
     <label className="block text-sm">{t.status}<select className={inputClass} name="status" defaultValue={field.status}><option value="active">{t.active}</option><option value="inactive">{t.inactive}</option></select></label>
    </ActionForm>}
   </li>)}</ul>{!fields.length&&<p className="text-sm text-muted-foreground">{t.groupingNone}</p>}
  </section>
  <section className="space-y-4 rounded-xl border bg-card p-4"><h2 className="font-semibold">{t.groupingValue}</h2>
   {selected?<>
    <p className="text-sm text-muted-foreground">{t.groupingValueHelp} <span className="font-medium">{selected.name}</span></p>
    <ActionForm action={saveGroupingValue} label={t.save}><input type="hidden" name="field_id" value={selected.id}/><label className="block text-sm">{t.groupingValue}<input className={inputClass} name="name" required minLength={1} maxLength={80}/></label></ActionForm>
    <table className={tableClass}><thead><tr>{[t.groupingValue,t.status,t.actions].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{values.map(value=><tr key={value.id}><td colSpan={3} className="p-0">
     {canManage(selected)?<ActionForm action={saveGroupingValue} label={t.save} className="grid gap-3 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"><input type="hidden" name="field_id" value={selected.id}/><input type="hidden" name="id" value={value.id}/>
      <label className="block text-sm">{t.groupingValue}<input className={inputClass} name="name" defaultValue={value.name} required minLength={1} maxLength={80}/></label>
      <label className="block text-sm">{t.status}<select className={inputClass} name="status" defaultValue={value.status}><option value="active">{t.active}</option><option value="inactive">{t.inactive}</option></select></label>
     </ActionForm>:<div className="flex items-center gap-3 p-3"><span>{value.name}</span><Status value={value.status}/></div>}
    </td></tr>)}</tbody></table>{!values.length&&<p className="text-sm text-muted-foreground">{t.groupingNone}</p>}
   </>:<p className="text-sm text-muted-foreground">{t.groupingNone}</p>}
  </section>
 </div></>;
}
