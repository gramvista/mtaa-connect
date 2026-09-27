import { requireAgent } from '@/features/auth/context';
import { changePassword } from '@/features/auth/actions';
import { ActionForm,inputClass } from '@/components/ui/form';
import { adminText as t } from '@/i18n/admin';
export default async function AgentSettings(){await requireAgent();return <><h1 className="text-2xl font-bold">{t.settings}</h1><div className="max-w-xl"><ActionForm action={changePassword} label={t.changePassword}><label className="block text-sm">{t.newPassword}<input className={inputClass} type="password" name="password" autoComplete="new-password" required minLength={8} maxLength={128}/></label></ActionForm></div></>}
