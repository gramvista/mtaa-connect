'use client';
import { useState } from 'react';
import { saveLocation } from '@/features/management/actions';
import { Button } from '@/components/ui/button';
import { inputClass } from '@/components/ui/form';
import { adminText as t } from '@/i18n/admin';

export function InlineLocationCreate({kind,parent,onSaved,onBusy}:{
 kind:'mitaa'|'balozi_areas';parent:string;
 onSaved:(id:string)=>void;onBusy:(busy:boolean)=>void;
}) {
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[leader,setLeader]=useState('');
 const [pending,setPending]=useState(false),[error,setError]=useState('');
 async function save() {
  if(pending)return;
  if(name.trim().length<2||name.trim().length>80){setError(t.invalid);return;}
  setPending(true);onBusy(true);setError('');
  try {
   const data=new FormData();
   data.set('kind',kind);data.set('parent',parent);data.set('name',name.trim());
   if(kind==='balozi_areas')data.set('balozi_name',leader.trim());
   const result=await saveLocation({},data);
   if(result.error||!result.id){setError(result.error||t.failedSave);return;}
   onSaved(result.id);setName('');setLeader('');setOpen(false);
  }catch{setError(t.failedSave);}
  finally{setPending(false);onBusy(false);}
 }
 if(!open)return <Button type="button" variant="outline" size="sm" disabled={!parent} onClick={()=>setOpen(true)}>{kind==='mitaa'?t.addMtaa:t.addBalozi}</Button>;
 return <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
  <p className="text-sm text-muted-foreground">{t.inlineLocationHelp}</p>
  <label className="block text-sm">{kind==='mitaa'?t.mtaa:t.balozi}<input className={inputClass} value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={80} autoFocus onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void save();}}}/></label>
  {kind==='balozi_areas'&&<label className="block text-sm">{t.baloziName}<input className={inputClass} value={leader} onChange={e=>setLeader(e.target.value)} maxLength={120} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void save();}}}/></label>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={pending} onClick={()=>void save()}>{pending?t.saving:t.saveAndSelect}</Button><Button type="button" size="sm" variant="outline" disabled={pending} onClick={()=>{setOpen(false);setError('');}}>{t.chooseExisting}</Button></div>
 </div>;
}
