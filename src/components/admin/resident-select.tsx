'use client';
import { useEffect,useState } from 'react';
import { inputClass } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { adminText as t } from '@/i18n/admin';
type Option={id:string;full_name:string;phone_number:string};
export function ResidentSelect({mtaa}:{mtaa:string}){
 const [query,setQuery]=useState(''),[page,setPage]=useState(1),[rows,setRows]=useState<Option[]>([]),[count,setCount]=useState(0),[selected,setSelected]=useState<string[]>([]),[error,setError]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>{
   fetch('/api/resident-options?'+new URLSearchParams({mtaa,q:query,page:String(page)}),{signal:controller.signal})
    .then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(d=>{setRows(d.rows);setCount(d.count);setError(false);})
    .catch(()=>{if(!controller.signal.aborted){setRows([]);setError(true);}});
  },250);
  return()=>{clearTimeout(timer);controller.abort();};
 },[mtaa,query,page]);
 return <fieldset className="space-y-3"><legend className="font-medium">{t.targetSelected}</legend>
  <label className="block text-sm">{t.search}<input type="search" className={inputClass} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder={t.searchHint}/></label>
  {rows.map(r=><label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm" key={r.id}><input type="checkbox" checked={selected.includes(r.id)} disabled={!selected.includes(r.id)&&selected.length>=500} onChange={e=>setSelected(e.target.checked?[...selected,r.id]:selected.filter(id=>id!==r.id))}/>{r.full_name} · {r.phone_number}</label>)}
  {!rows.length&&<p className="text-sm">{t.empty}</p>}{error&&<p role="alert" className="text-destructive">{t.unavailable}</p>}
  <div className="flex items-center gap-3 text-sm"><Button variant="outline" size="sm" type="button" disabled={page<=1} onClick={()=>setPage(page-1)}>{t.previous}</Button><span>{t.page} {page}</span><Button variant="outline" size="sm" type="button" disabled={page*25>=count} onClick={()=>setPage(page+1)}>{t.next}</Button></div>
  <p className="text-sm">{t.recipients}: {selected.length} / 500</p><input type="hidden" name="selected" value={selected.join(',')}/>
 </fieldset>;
}
