import { requireAgent } from '@/features/auth/context';
import { changePassword } from '@/features/auth/actions';
import { ActionForm } from '@/components/ui/form';
import { PasswordPair } from '@/components/ui/password-input';
import { adminText as t } from '@/i18n/admin';
export default async function AgentSettings(){await requireAgent();return <><h1 className="text-2xl font-bold">{t.settings}</h1><div className="max-w-xl"><ActionForm action={changePassword} label={t.changePassword}><PasswordPair/></ActionForm></div></>}
