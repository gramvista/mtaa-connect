'use client';
import { useState } from 'react';
import { LocationPicker,LocationSelect,type LocationPath } from './location-picker';
import { ActionForm,inputClass } from '@/components/ui/form';
import { previewCampaign } from '@/features/campaigns/actions';
import { adminText as t } from '@/i18n/admin';
import { ResidentSelect } from './resident-select';
export function CampaignForm({initialPath,lockMtaa=false}:{initialPath:LocationPath;lockMtaa?:boolean}){
 const [path,setPath]=useState(initialPath),[type,setType]=useState('all'),[category,setCategory]=useState(''),[groupField,setGroupField]=useState(''),[groupValue,setGroupValue]=useState('');
 const targets=[['all',t.targetAll],['balozi',t.targetBalozi],['category',t.targetCategory],['balozi_category',t.targetCombined],['group',t.targetGroup],['selected',t.targetSelected]];
 return <ActionForm action={previewCampaign} label={t.preview}>
  <label className="block text-sm">{t.title}<input name="title" required minLength={2} maxLength={120} className={inputClass}/></label>
  <label className="block text-sm">{t.message}<textarea name="message" rows={5} required maxLength={1000} className={inputClass}/><span className="mt-1 block text-xs text-muted-foreground">{t.personalizedMessageHelp}</span></label>
  <label className="block text-sm">{t.target}<select name="type" value={type} onChange={e=>setType(e.target.value)} className={inputClass}>{targets.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <p className="rounded-lg bg-muted p-4 text-sm">{t.campaignAudienceHelp}</p>
  {(!lockMtaa||['balozi','balozi_category'].includes(type))&&<LocationPicker value={path} onChange={p=>{if(p.mtaa!==path.mtaa){setCategory('');setGroupField('');setGroupValue('');}setPath(p);}} level={['balozi','balozi_category'].includes(type)?'balozi':'mtaa'} required lockedMtaa={lockMtaa}/>}
  <input type="hidden" name="mtaa_id" value={path.mtaa}/><input type="hidden" name="balozi" value={['balozi','balozi_category'].includes(type)?path.balozi:''}/>
  {['category','balozi_category'].includes(type)&&<LocationSelect kind="categories" parent={path.mtaa} value={category} onChange={setCategory} name="category" label={t.categories} required/>}
  {type==='group'&&<><LocationSelect kind="grouping_fields" parent={path.mtaa} value={groupField} onChange={id=>{setGroupField(id);setGroupValue('');}} name="group_field" label={t.groupingField} required/><LocationSelect kind="grouping_values" parent={groupField} value={groupValue} onChange={setGroupValue} name="group_value" label={t.targetGroupValue} required/></>}
  {type==='selected'&&<ResidentSelect key={path.mtaa} mtaa={path.mtaa}/>}
 </ActionForm>;
}
