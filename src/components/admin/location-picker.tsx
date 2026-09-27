'use client';
import { useEffect,useState } from 'react';
import { inputClass } from '@/components/ui/form';
import { adminText as t } from '@/i18n/admin';
import { InlineLocationCreate } from './inline-location-create';
import type { Location } from '@/types/domain';
export type LocationPath={region:string;district:string;ward:string;mtaa:string;balozi:string};
export const emptyPath:LocationPath={region:'',district:'',ward:'',mtaa:'',balozi:''};

export function LocationSelect({kind,parent,value,onChange,label,name,required=false,disabled=false,endpoint='/api/locations'}:{kind:string;parent?:string;value:string;onChange:(value:string)=>void;label:string;name?:string;required?:boolean;disabled?:boolean;endpoint?:string}) {
 const [rows,setRows]=useState<Location[]>([]),[error,setError]=useState(false),[loading,setLoading]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  if(kind!=='regions'&&!parent) return;
  const url=endpoint+'?'+new URLSearchParams({kind,...(parent?{parent}:{})});
  // Begin asynchronously to avoid setting state directly during effect setup.
  Promise.resolve().then(()=>{if(!controller.signal.aborted){setLoading(true);setError(false);}});
  fetch(url,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error();return response.json();})
   .then(data=>{if(!controller.signal.aborted)setRows(data.rows);})
   .catch(()=>{if(!controller.signal.aborted){setRows([]);setError(true);}})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[kind,parent,endpoint]);
 const available=kind==='regions'||!!parent;
 return <label className="block text-sm">{label}<select className={inputClass} name={name} value={value} onChange={e=>onChange(e.target.value)} required={required} disabled={disabled||!available||loading}>
  <option value="">{loading?'…':t.select}</option>{available&&rows.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
 </select>{error&&<span role="alert" className="text-destructive">{t.unavailable}</span>}</label>;
}
export function LocationPicker({value,onChange,level='balozi',required=false,baloziOptional=false,allowCreate=false,superAdmin=false,lockedMtaa=false,onBusy,endpoint='/api/locations'}:{value:LocationPath;onChange:(path:LocationPath)=>void;level?:keyof LocationPath;required?:boolean;baloziOptional?:boolean;allowCreate?:boolean;superAdmin?:boolean;lockedMtaa?:boolean;onBusy?:(busy:boolean)=>void;endpoint?:string}) {
 const [revision,setRevision]=useState(0);
 const levels:[keyof LocationPath,string,string][]=[['region','regions',t.region],['district','districts',t.district],['ward','wards',t.ward],['mtaa','mitaa',t.mtaa],['balozi','balozi_areas',t.balozi]];
 const visible=levels.slice(0,levels.findIndex(([key])=>key===level)+1).filter(([key])=>!lockedMtaa||key==='balozi');
 return <div className="grid gap-4 sm:grid-cols-2">{lockedMtaa&&<p className="rounded-lg bg-muted p-3 text-sm sm:col-span-2">{t.assignedMtaaOnly}</p>}{visible.map(([key,kind,label])=>{
  const index=levels.findIndex(([candidate])=>candidate===key);
  const parent=index?value[levels[index-1][0]]:undefined;
  const change=(id:string)=>{const next={...value,[key]:id};for(let i=index+1;i<levels.length;i++)next[levels[i][0]]='';onChange(next);};
  return <div key={key+parent} className="space-y-2">
   <LocationSelect endpoint={endpoint} key={revision} kind={kind} parent={parent} value={value[key]} label={key==='balozi'&&baloziOptional?`${label} (${t.optional})`:label} required={required&&!(key==='balozi'&&baloziOptional)} onChange={change}/>
   {allowCreate&&onBusy&&(kind==='balozi_areas'||(kind==='mitaa'&&superAdmin))&&<InlineLocationCreate kind={kind} parent={parent||''} onBusy={onBusy} onSaved={id=>{setRevision(v=>v+1);change(id);}}/>}
  </div>;
 })}</div>;
}
