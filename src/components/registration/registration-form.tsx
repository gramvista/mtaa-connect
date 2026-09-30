'use client';
import { useEffect,useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { registrationSchema,type RegistrationInput } from '@/features/registration/schema';
import { registerResident,startNewPublicRegistration } from '@/features/registration/actions';
import { LocationPicker,emptyPath,type LocationPath } from '@/components/admin/location-picker';
import { inputClass } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { registrationText as t } from '@/i18n/registration';
import { adminText as a } from '@/i18n/admin';
import type { GroupingField,GroupingValue,Location } from '@/types/domain';

export function RegistrationForm({regions}:{regions:Location[]}){
 const router=useRouter();
 const [path,setPath]=useState(emptyPath),[categories,setCategories]=useState<Location[]>([]);
 const [groupFields,setGroupFields]=useState<GroupingField[]>([]),[groupValues,setGroupValues]=useState<Record<string,GroupingValue[]>>({}),[selectedGroups,setSelectedGroups]=useState<Record<string,string>>({});
 const [error,setError]=useState(''),[categoryError,setCategoryError]=useState(false),[retry,setRetry]=useState(0);
 const form=useForm<RegistrationInput>({resolver:zodResolver(registrationSchema),defaultValues:{mtaa_id:'',balozi_area_id:'',full_name:'',phone_number:'',category_ids:[],group_values:[],consent:false,website:''}});
 useEffect(()=>{
  if(!path.mtaa)return;
  const controller=new AbortController();
  fetch('/api/public/locations?'+new URLSearchParams({kind:'categories',parent:path.mtaa}),{signal:controller.signal})
   .then(async response=>{if(!response.ok)throw new Error();return response.json();})
   .then(data=>{if(!controller.signal.aborted){setCategories(data.rows);setCategoryError(false);}})
   .catch(()=>{if(!controller.signal.aborted)setCategoryError(true);});
  return()=>controller.abort();
 },[path.mtaa,retry]);
 useEffect(()=>{
  if(!path.mtaa)return;
  const controller=new AbortController();
  (async()=>{
   const response=await fetch('/api/public/locations?'+new URLSearchParams({kind:'grouping_bundle',parent:path.mtaa}),{signal:controller.signal});
   if(!response.ok)throw new Error();
   const data=await response.json() as {fields:GroupingField[];values:GroupingValue[]};
   if(controller.signal.aborted)return;
   const map:Record<string,GroupingValue[]>={};data.fields.forEach(field=>{map[field.id]=data.values.filter(value=>value.field_id===field.id);});
   setGroupFields(data.fields);setGroupValues(map);
  })().catch(()=>{if(!controller.signal.aborted)setCategoryError(true);});
  return()=>controller.abort();
 },[path.mtaa,retry]);
 function change(next:LocationPath){
  if(next.mtaa!==path.mtaa){setCategories([]);setGroupFields([]);setGroupValues({});setSelectedGroups({});setCategoryError(false);form.setValue('category_ids',[]);form.setValue('group_values',[]);}
  setPath(next);form.setValue('mtaa_id',next.mtaa);form.setValue('balozi_area_id',next.balozi);
 }
 const submit=form.handleSubmit(async values=>{
  setError('');
  try{const result=await registerResident(values);if(result.error)setError(result.error);else if(result.success)router.push('/register/payment');}
  catch{setError(t.unavailable);}
 });
 return <><form onSubmit={submit} noValidate className="space-y-7">
  <fieldset disabled={form.formState.isSubmitting} className="space-y-7">
   <section className="space-y-4"><h2 className="font-semibold">{t.locations}</h2><LocationPicker value={path} onChange={change} required baloziOptional endpoint="/api/public/locations" initialRegions={regions}/><p className="text-sm text-muted-foreground">{t.empty}</p></section>
   <section className="space-y-4"><h2 className="font-semibold">{t.details}</h2>
    <label className="block text-sm">{a.name}<input className={inputClass} autoComplete="name" maxLength={120} {...form.register('full_name')}/></label>
    <label className="block text-sm">{a.phone}<input className={inputClass} type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" {...form.register('phone_number')}/></label>
    <fieldset><legend className="text-sm font-medium">{a.categories}</legend><p className="text-sm text-muted-foreground">{t.categoryHelp}</p><div className="mt-3 flex flex-wrap gap-3">{categories.map(c=><label key={c.id} className="flex min-h-11 items-center gap-2 rounded-lg border px-3"><input type="checkbox" value={c.id} {...form.register('category_ids')}/>{c.name}</label>)}</div></fieldset>
    {groupFields.length>0&&<fieldset><legend className="text-sm font-medium">{a.residentGroups}</legend><p className="text-sm text-muted-foreground">{a.groupsHelp}</p><div className="mt-3 grid gap-4 sm:grid-cols-2">{groupFields.map(field=><label key={field.id} className="block text-sm">{field.name}<select className={inputClass} value={selectedGroups[field.id]||''} onChange={e=>{const next={...selectedGroups,[field.id]:e.target.value};setSelectedGroups(next);form.setValue('group_values',Object.values(next).filter(Boolean));}}><option value="">{a.select}</option>{(groupValues[field.id]||[]).map(value=><option key={value.id} value={value.id}>{value.name}</option>)}</select></label>)}</div></fieldset>}
    {categoryError&&<p role="alert" className="text-sm text-destructive">{t.unavailable} <Button type="button" variant="outline" size="sm" onClick={()=>setRetry(n=>n+1)}>{a.search}</Button></p>}
   </section>
   <section className="rounded-xl bg-muted p-4 space-y-3"><h2 className="font-semibold">{t.fee}</h2><p className="text-sm">{t.feeHelp}</p><p className="text-sm">{t.purpose}</p><label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" {...form.register('consent')}/>{t.consent}</label></section>
   <div hidden aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" {...form.register('website')}/></label></div>
  </fieldset>
  {Object.keys(form.formState.errors).length>0&&<p role="alert" className="text-sm text-destructive">{t.invalid}</p>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <Button className="w-full whitespace-normal" type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting?t.submitting:t.submit}</Button>
  <Link className="block text-center text-sm underline" href="/register/payment">{t.resume}</Link>
 </form>
 <form action={startNewPublicRegistration} className="mt-4 rounded-xl border p-4 text-center">
  <p className="mb-3 text-sm text-muted-foreground">{t.newRegistrationHelp}</p>
  <Button type="submit" variant="outline">{t.newRegistration}</Button>
 </form>
 </>;
}
