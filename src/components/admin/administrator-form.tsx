'use client';
import { useState } from 'react';
import { LocationPicker,type LocationPath } from './location-picker';
import { ActionForm,inputClass } from '@/components/ui/form';
import { createAdministrator,updateAdministrator } from '@/features/management/actions';
import { adminText as t } from '@/i18n/admin';
import type { Profile } from '@/types/domain';
export function AdministratorForm({initialPath,profile}:{initialPath:LocationPath;profile?:Profile}){
 const [path,setPath]=useState(initialPath);
 return <ActionForm action={profile?updateAdministrator:createAdministrator} label={profile?t.assign:t.createAdmin}>
 {profile&&<input type="hidden" name="id" value={profile.id}/>}
  <label className="block text-sm">{t.name}<input className={inputClass} name="name" defaultValue={profile?.full_name} required maxLength={120}/></label>
  <label className="block text-sm">{t.email}<input className={inputClass} type="email" name="email" defaultValue={profile?.email||''} required maxLength={254}/></label>
  {!profile&&<label className="block text-sm">{t.newPassword}<input className={inputClass} type="password" name="password" autoComplete="new-password" required minLength={8} maxLength={128}/></label>}
  <label className="block text-sm">{t.role}<select className={inputClass} name="role" defaultValue={profile?.role||'mtaa_admin'}><option value="mtaa_admin">{t.mtaa_admin}</option><option value="agent">{t.agent}</option></select></label>
  <LocationPicker value={path} onChange={setPath} level="mtaa" required/><input type="hidden" name="mtaa_id" value={path.mtaa}/>
  {profile&&<label className="block text-sm">{t.status}<select name="status" defaultValue={profile.status} className={inputClass}><option value="active">{t.active}</option><option value="suspended">{t.suspended}</option></select></label>}
 </ActionForm>;
}
