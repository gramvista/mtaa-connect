'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { agentRegistrationSchema,type AgentRegistrationInput } from '@/features/agents/schema';
import { registerByAgent } from '@/features/agents/actions';
import { inputClass } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { adminText as t } from '@/i18n/admin';
import type { GroupingField,GroupingValue,Location } from '@/types/domain';

export function AgentRegistrationForm({mtaaId,mtaaName,keyValue,balozi,categories,fields,values}:{
 mtaaId:string;mtaaName:string;keyValue:string;balozi:Location[];categories:Location[];
 fields:GroupingField[];values:GroupingValue[];
}){
 const router=useRouter();
 const [error,setError]=useState(''),[chosen,setChosen]=useState<Record<string,string>>({});
 const form=useForm<AgentRegistrationInput>({resolver:zodResolver(agentRegistrationSchema),defaultValues:{mtaa_id:mtaaId,balozi_area_id:'',full_name:'',phone_number:'',payment_phone:'',category_ids:[],group_values:[],consent:false,key:keyValue}});
 const submit=form.handleSubmit(async input=>{
  setError('');
  try{
   const result=await registerByAgent(input);
   if(result.error){setError(result.error);return;}
   if(result.url){window.location.assign(result.url);return;}
   router.push('/agent?registered=1');router.refresh();
  }catch{setError(t.unavailable);}
 });
 return <form onSubmit={submit} noValidate className="space-y-6">
  <fieldset disabled={form.formState.isSubmitting} className="space-y-5">
   <div className="rounded-lg bg-muted p-4"><p className="text-sm text-muted-foreground">{t.mtaa}</p><p className="font-semibold">{mtaaName}</p></div>
   <label className="block text-sm">{t.balozi} ({t.optional})<select className={inputClass} {...form.register('balozi_area_id')}><option value="">{t.select}</option>{balozi.map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
   <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">{t.name}<input className={inputClass} autoComplete="name" maxLength={120} {...form.register('full_name')}/></label><label className="text-sm">{t.phone}<input className={inputClass} type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" {...form.register('phone_number')}/></label></div>
   <label className="block text-sm">{t.payerPhone}<input className={inputClass} type="tel" inputMode="tel" autoComplete="tel" placeholder="0689 123 456" {...form.register('payment_phone')}/><span className="mt-1 block text-xs text-muted-foreground">{t.payerPhoneHelp}</span></label>
   <fieldset><legend className="font-medium">{t.categories}</legend><p className="text-sm text-muted-foreground">{t.categoryHelp}</p><div className="mt-3 flex flex-wrap gap-3">{categories.map(category=><label key={category.id} className="flex min-h-11 items-center gap-2 rounded-lg border px-3"><input type="checkbox" value={category.id} {...form.register('category_ids')}/>{category.name}</label>)}</div></fieldset>
   {fields.length>0&&<fieldset><legend className="font-medium">{t.residentGroups}</legend><div className="mt-3 grid gap-4 sm:grid-cols-2">{fields.map(field=><label key={field.id} className="text-sm">{field.name}<select className={inputClass} value={chosen[field.id]||''} onChange={event=>{const next={...chosen,[field.id]:event.target.value};setChosen(next);form.setValue('group_values',Object.values(next).filter(Boolean));}}><option value="">{t.select}</option>{values.filter(value=>value.field_id===field.id).map(value=><option key={value.id} value={value.id}>{value.name}</option>)}</select></label>)}</div></fieldset>}
   <p className="rounded-lg bg-muted p-4 text-sm">{t.agentRegistrationHelp}</p>
   <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" {...form.register('consent')}/>{t.consent}</label>
  </fieldset>
  {Object.keys(form.formState.errors).length>0&&<p role="alert" className="text-destructive">{t.invalid}</p>}
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting?t.saving:t.agentRegister}</Button>
 </form>;
}
