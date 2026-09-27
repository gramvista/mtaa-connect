'use client';
import { useState } from 'react';
import { LocationPicker,LocationSelect,emptyPath } from './location-picker';
import { inputClass } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { adminText as t } from '@/i18n/admin';
export function ResidentFilters({values}:{values:Record<string,string>}){
 const [path,setPath]=useState({...emptyPath,region:values.region||'',district:values.district||'',ward:values.ward||'',mtaa:values.mtaa||'',balozi:values.balozi||''});
 const [category,setCategory]=useState(values.category||''),[groupField,setGroupField]=useState(''),[groupValue,setGroupValue]=useState(values.group||'');
 return <form className="space-y-4 rounded-xl border bg-card p-4">
  <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm">{t.search}<input className={inputClass} name="q" defaultValue={values.q} placeholder={t.searchHint} maxLength={80}/></label>
   <label className="text-sm">{t.subscription}<select className={inputClass} name="subscription" defaultValue={values.subscription||''}><option value="">{t.all}</option>{['active','expired','pending'].map(s=><option value={s} key={s}>{t[s as 'active']}</option>)}</select></label>
   <label className="text-sm">{t.registration}<select className={inputClass} name="registration" defaultValue={values.registration||''}><option value="">{t.all}</option><option value="approved">{t.approvedStatus}</option><option value="pending">{t.pending}</option><option value="rejected">{t.rejected}</option></select></label>
  </div>
  <details><summary className="cursor-pointer text-sm font-medium">{t.locations} / {t.categories} / {t.residentGroups}</summary><div className="mt-4 space-y-4"><LocationPicker value={path} onChange={next=>{if(next.mtaa!==path.mtaa){setCategory('');setGroupField('');setGroupValue('');}setPath(next);}}/><LocationSelect kind="categories" parent={path.mtaa} value={category} onChange={setCategory} name="category" label={t.categories}/><LocationSelect kind="grouping_fields" parent={path.mtaa} value={groupField} onChange={id=>{setGroupField(id);setGroupValue('');}} label={t.groupingField}/><LocationSelect kind="grouping_values" parent={groupField} value={groupValue} onChange={setGroupValue} name="group" label={t.targetGroupValue}/></div></details>
  {Object.entries(path).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}
  <Button type="submit" size="sm">{t.search}</Button>
 </form>;
}
