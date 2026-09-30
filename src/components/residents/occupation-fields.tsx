'use client';
import { inputClass } from '@/components/ui/form';
import { otherOccupationCode } from '@/features/residents/occupations';
import { adminText as t } from '@/i18n/admin';
import type { Occupation } from '@/types/domain';

export function OccupationFields({occupations,selected,other,onChange,onOtherChange}:{
 occupations:Occupation[];selected:string[];other:string;
 onChange:(codes:string[])=>void;onOtherChange:(value:string)=>void;
}){
 const choose=(code:string,checked:boolean)=>{
  const next=checked?[...selected,code]:selected.filter(value=>value!==code);
  onChange(next);
  if(code===otherOccupationCode&&!checked)onOtherChange('');
 };
 return <fieldset>
  <legend className="font-medium">{t.occupations}</legend>
  <p className="mt-1 text-sm text-muted-foreground">{t.occupationHelp}</p>
  <div className="mt-3 grid gap-3 sm:grid-cols-2">
   {occupations.map(occupation=>{
    const checked=selected.includes(occupation.code);
    return <label key={occupation.code} className={`flex min-h-12 items-center gap-3 rounded-lg border px-4 py-2 transition-colors ${checked?'border-primary bg-primary/5':''}`}>
     <input type="checkbox" value={occupation.code} checked={checked} disabled={!checked&&selected.length>=3} onChange={event=>choose(occupation.code,event.target.checked)}/>
     <span>{occupation.name}</span>
    </label>;
   })}
  </div>
  {selected.includes(otherOccupationCode)&&<label className="mt-4 block text-sm">{t.otherOccupation}
   <input className={inputClass} value={other} onChange={event=>onOtherChange(event.target.value)} maxLength={120} required placeholder={t.otherOccupationPlaceholder}/>
  </label>}
 </fieldset>;
}
