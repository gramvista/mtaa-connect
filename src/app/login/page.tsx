import { login } from '@/features/auth/actions';
import { getPublicEnv } from '@/config/env';
import { adminText as t } from '@/i18n/admin';
import { ActionForm,inputClass } from '@/components/ui/form';
import { Card } from '@/components/ui/card';
import { PasswordInput } from '@/components/ui/password-input';
import Link from 'next/link';
export const dynamic='force-dynamic';
export default async function LoginPage({searchParams}:{searchParams:Promise<{error?:string;reset?:string;confirmed?:string}>}) {
 let configured=true; try {getPublicEnv();if(!process.env.SUPABASE_SERVICE_ROLE_KEY) configured=false;} catch {configured=false;}
 const {error,reset,confirmed}=await searchParams;
 return <main id="main-content" className="mx-auto max-w-md px-5 py-16"><p className="mb-6 font-bold text-primary">{t.brand}</p><Card>
  <h1 className="text-2xl font-bold">{t.loginTitle}</h1><p className="mt-3 mb-6 text-muted-foreground">{t.loginDescription}</p>
  {!configured?<p role="status">{t.setup}</p>:<><ActionForm action={login} label={t.login}>
   <label className="block text-sm">{t.email}<input className={inputClass} type="email" name="email" autoComplete="username" required maxLength={254}/></label>
   <PasswordInput label={t.password} name="password" autoComplete="current-password" required maxLength={256}/>
  </ActionForm><Link href="/forgot-password" className="mt-4 inline-block text-sm underline">{t.forgotPassword}</Link>
  {reset&&<p role="status" className="mt-4 text-sm text-primary">{t.passwordResetComplete}</p>}
  {confirmed&&<p role="status" className="mt-4 text-sm text-primary">{t.accountConfirmed}</p>}
  {error&&<p role="alert" className="mt-4 text-destructive">{error==='confirmation'?t.confirmationFailed:error==='reset'?t.resetLinkInvalid:t.invalidLogin}</p>}</>}
 </Card></main>;
}
