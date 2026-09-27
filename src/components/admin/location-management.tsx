'use client';
import { useState } from 'react';
import { LocationPicker,type LocationPath } from './location-picker';
import { ActionForm,inputClass } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { saveLocation } from '@/features/management/actions';
import { adminText as t } from '@/i18n/admin';
export function LocationManagement({superAdmin,initialPath,initialKind}:{superAdmin:boolean;initialPath:LocationPath;initialKind:string}){
 const [kind,setKind]=useState(initialKind),[path,setPath]=useState(initialPath),[global,setGlobal]=useState(false);
 const levels:Record<string,keyof LocationPath>={districts:'region',wards:'district',mitaa:'ward',balozi_areas:'mtaa',categories:'mtaa'};
 const parent=kind==='regions'||(kind==='categories'&&global)?'':path[levels[kind]];
 return <section className="space-y-5 rounded-xl border bg-card p-5">
  <label className="block text-sm">{t.locationType}<select className={inputClass} value={kind} onChange={e=>setKind(e.target.value)}>{(superAdmin?['regions','districts','wards','mitaa','balozi_areas','categories']:['balozi_areas','categories']).map(k=><option key={k} value={k}>{t[k as 'regions']}</option>)}</select></label>
  {kind==='categories'&&superAdmin&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={global} onChange={e=>setGlobal(e.target.checked)}/>{t.global}</label>}
  {kind!=='regions'&&!(kind==='categories'&&global)&&<LocationPicker value={path} onChange={setPath} level={levels[kind]} lockedMtaa={!superAdmin}/>}
  <form className="flex gap-3"><input type="hidden" name="kind" value={kind}/><input type="hidden" name="parent" value={parent}/>{Object.entries(path).map(([key,value])=><input key={key} type="hidden" name={key} value={value}/>)}<Button size="sm" variant="outline">{t.search}</Button></form>
  <ActionForm action={saveLocation} key={kind+parent}>
   <input type="hidden" name="kind" value={kind}/><input type="hidden" name="parent" value={parent}/>
   <label className="block text-sm">{t.locationName}<input className={inputClass} name="name" minLength={2} maxLength={80} required/></label>
   {kind==='balozi_areas'&&<label className="block text-sm">{t.baloziName}<input className={inputClass} name="balozi_name" maxLength={120}/></label>}
  </ActionForm>
 </section>;
}
