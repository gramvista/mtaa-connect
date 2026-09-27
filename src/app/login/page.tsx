import { login } from '@/features/auth/actions';
import { getPublicEnv } from '@/config/env';
import { adminText as t } from '@/i18n/admin';
import { ActionForm,inputClass } from '@/components/ui/form';
import { Card } from '@/components/ui/card';
export const dynamic='force-dynamic';
export default async function LoginPage({searchParams}:{searchParams:Promise<{error?:string}>}) {
 let configured=true; try {getPublicEnv();if(!process.env.SUPABASE_SERVICE_ROLE_KEY) configured=false;} catch {configured=false;}
 const {error}=await searchParams;
 return <main id="main-content" className="mx-auto max-w-md px-5 py-16"><p className="mb-6 font-bold text-primary">{t.brand}</p><Card>
  <h1 className="text-2xl font-bold">{t.loginTitle}</h1><p className="mt-3 mb-6 text-muted-foreground">{t.loginDescription}</p>
  {!configured?<p role="status">{t.setup}</p>:<><ActionForm action={login} label={t.login}>
   <label className="block text-sm">{t.email}<input className={inputClass} type="email" name="email" autoComplete="username" required maxLength={254}/></label>
   <label className="block text-sm">{t.password}<input className={inputClass} type="password" name="password" autoComplete="current-password" required maxLength={256}/></label>
  </ActionForm>{error&&<p role="alert" className="mt-4 text-destructive">{t.invalidLogin}</p>}</>}
 </Card></main>;
}
