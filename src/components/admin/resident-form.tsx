'use client';
import { useState,useEffect } from 'react';
import { useForm,useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { residentSchema,type ResidentInput } from '@/features/residents/schema';
import { saveResident } from '@/features/residents/actions';
import { LocationPicker,type LocationPath } from './location-picker';
import { inputClass } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { OccupationFields } from '@/components/residents/occupation-fields';
import { adminText as t } from '@/i18n/admin';
import type { Location,Resident,GroupingField,GroupingValue,Occupation } from '@/types/domain';

export function ResidentForm({initialPath,occupations,resident,superAdmin=false}:{initialPath:LocationPath;occupations:Occupation[];resident?:Resident;superAdmin?:boolean}) {
 const [path,setPath]=useState(initialPath),[categories,setCategories]=useState<Location[]>([]),[error,setError]=useState('');
 const [groupFields,setGroupFields]=useState<GroupingField[]>([]),[groupValues,setGroupValues]=useState<Record<string,GroupingValue[]>>({}),[selected,setSelected]=useState<Record<string,string>>({});
 const [creatingLocation,setCreatingLocation]=useState(false);
 const groupIds=resident?.group_value_ids;
 const router=useRouter();
 const form=useForm<ResidentInput>({resolver:zodResolver(residentSchema),defaultValues:{id:resident?.id||'',full_name:resident?.full_name||'',phone_number:resident?.phone_number||'',mtaa_id:initialPath.mtaa,balozi_area_id:initialPath.balozi,category_ids:resident?.category_ids||[],group_values:resident?.group_value_ids||[],occupation_codes:resident?.occupation_codes||[],occupation_other:resident?.occupation_other||'',consent:false,approved:superAdmin&&!resident||resident?.registration_status==='approved'}});
 const occupationCodes=useWatch({control:form.control,name:'occupation_codes'})||[],occupationOther=useWatch({control:form.control,name:'occupation_other'})||'';
 useEffect(()=>{
  if(!path.mtaa)return;
  const controller=new AbortController();
  fetch('/api/locations?'+new URLSearchParams({kind:'categories',parent:path.mtaa}),{signal:controller.signal})
   .then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(d=>setCategories(d.rows))
   .catch(()=>{if(!controller.signal.aborted)setError(t.unavailable);});
  return ()=>controller.abort();
 },[path.mtaa]);
 useEffect(()=>{
  if(!path.mtaa)return;
  const controller=new AbortController();
  (async()=>{
   const response=await fetch('/api/locations?'+new URLSearchParams({kind:'grouping_bundle',parent:path.mtaa}),{signal:controller.signal});
   if(!response.ok)throw new Error();
   const data=await response.json() as {fields:GroupingField[];values:GroupingValue[]};
   if(controller.signal.aborted)return;
   const map:Record<string,GroupingValue[]>={},chosen:Record<string,string>={};
   data.fields.forEach(field=>{const values=data.values.filter(value=>value.field_id===field.id);map[field.id]=values;const match=values.find(value=>(groupIds||[]).includes(value.id));if(match)chosen[field.id]=match.id;});
   setGroupFields(data.fields);setGroupValues(map);setSelected(chosen);
   form.setValue('group_values',Object.values(chosen).filter(Boolean));
  })().catch(()=>{if(!controller.signal.aborted)setError(t.unavailable);});
  return ()=>controller.abort();
 },[path.mtaa,form,groupIds]);
 const changePath=(next:LocationPath)=>{
  if(next.mtaa!==path.mtaa){form.setValue('category_ids',[]);setCategories([]);setGroupFields([]);setGroupValues({});setSelected({});form.setValue('group_values',[]);}
  setPath(next);form.setValue('mtaa_id',next.mtaa);form.setValue('balozi_area_id',next.balozi);
 };
 const chooseGroup=(fieldId:string,valueId:string)=>{
  const value={...selected,[fieldId]:valueId};setSelected(value);form.setValue('group_values',Object.values(value).filter(Boolean));
 };
 const submit=form.handleSubmit(async values=>{
  if(creatingLocation)return;
  setError('');
  try {const result=await saveResident(values);if(result.error)setError(result.error);else{router.push(resident?'/admin/residents':`/admin/residents/${result.id}`);router.refresh();}}
  catch{setError(t.failedSave);}
 });
 return <form onSubmit={submit} className="max-w-3xl space-y-6" noValidate>
  <fieldset disabled={form.formState.isSubmitting||creatingLocation} className="space-y-6">
   <LocationPicker value={path} onChange={changePath} required baloziOptional allowCreate superAdmin={superAdmin} lockedMtaa={!superAdmin} onBusy={setCreatingLocation}/>
   <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">{t.name}<input {...form.register('full_name')} className={inputClass} autoComplete="name" maxLength={120}/></label><label className="text-sm">{t.phone}<input {...form.register('phone_number')} className={inputClass} type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678"/></label></div>
   <fieldset><legend className="font-medium">{t.categories}</legend><p className="mt-1 text-sm text-muted-foreground">{t.categoryHelp}</p><div className="mt-3 flex flex-wrap gap-4">{categories.map(c=><label key={c.id} className="flex min-h-11 items-center gap-2 rounded-lg border px-3"><input type="checkbox" value={c.id} {...form.register('category_ids')}/>{c.name}</label>)}</div></fieldset>
   <OccupationFields occupations={occupations} selected={occupationCodes} other={occupationOther} onChange={codes=>form.setValue('occupation_codes',codes,{shouldDirty:true,shouldValidate:true})} onOtherChange={value=>form.setValue('occupation_other',value,{shouldDirty:true,shouldValidate:true})}/>
   {groupFields.length>0&&<fieldset><legend className="font-medium">{t.residentGroups}</legend><p className="mt-1 text-sm text-muted-foreground">{t.groupsHelp}</p><div className="mt-3 grid gap-4 sm:grid-cols-2">{groupFields.map(field=><label key={field.id} className="block text-sm">{field.name}<select className={inputClass} value={selected[field.id]||''} onChange={e=>chooseGroup(field.id,e.target.value)}><option value="">{t.select}</option>{(groupValues[field.id]||[]).map(value=><option key={value.id} value={value.id}>{value.name}</option>)}</select></label>)}</div></fieldset>}
   <p className="rounded-lg bg-muted p-4 text-sm leading-relaxed">{t.purpose}</p>
   {!resident&&<p className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed">{superAdmin?t.superAdminResidentGrantHelp:t.residentPaymentNext}</p>}
   <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4 shrink-0" {...form.register('consent')}/>{t.consent}</label>
   <div><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4 shrink-0" {...form.register('approved')}/>{t.approved}</label><p className="mt-2 text-xs text-muted-foreground">{t.approvalHelp}</p></div>
  </fieldset>
  {Object.keys(form.formState.errors).length>0&&<p role="alert" className="text-destructive">{t.invalid} ({Object.keys(form.formState.errors).map(key=>({full_name:t.name,phone_number:t.phone,mtaa_id:t.mtaa,balozi_area_id:t.balozi,category_ids:t.categories,group_values:t.residentGroups,occupation_codes:t.occupations,occupation_other:t.otherOccupation,consent:t.consent}[key]||t.invalid)).join(', ')})</p>}
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  <Button disabled={form.formState.isSubmitting||creatingLocation} type="submit">{form.formState.isSubmitting?t.saving:t.save}</Button>
 </form>;
}
