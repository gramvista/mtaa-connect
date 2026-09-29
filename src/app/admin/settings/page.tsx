import { requireAdmin } from '@/features/auth/context';
import { changePassword } from '@/features/auth/actions';
import { saveWelcomeTemplate } from '@/features/management/actions';
import { saveMtaaSmsSettings } from '@/features/sms/actions';
import { ActionForm,inputClass } from '@/components/ui/form';
import { PasswordInput,PasswordPair } from '@/components/ui/password-input';
import { adminText as t } from '@/i18n/admin';
export default async function Settings(){
 const {db,profile}=await requireAdmin();
 const {data:template}=await db.from('sms_templates').select('message').eq('name','welcome').single();
 const {data:smsSetting}=profile.mtaa_id?await db.from('mtaa_sms_settings').select('mode,provider,sender_id,status').eq('mtaa_id',profile.mtaa_id).maybeSingle():{data:null};
 return <><h1 className="text-2xl font-bold">{t.settings}</h1><div className="max-w-xl space-y-8"><ActionForm action={changePassword} label={t.changePassword}><PasswordPair/></ActionForm>
 {profile.role==='super_admin'&&<ActionForm action={saveWelcomeTemplate} label={t.saveTemplate}><label className="block text-sm">{t.welcomeTemplate}<textarea name="message" rows={5} maxLength={1000} required defaultValue={template?.message} className={inputClass}/></label><p className="text-sm">{t.templateHelp}</p></ActionForm>}
 {profile.role==='mtaa_admin'&&<section className="rounded-xl border p-5"><h2 className="mb-2 font-semibold">{t.smsSettings}</h2><p className="mb-4 rounded-lg bg-primary/5 p-3 text-sm">{smsSetting?.mode==='own'?t.ownSmsUnlimited:t.officialSmsDefault}</p><p className="mb-4 text-sm text-muted-foreground">{t.smsConnectIntro}</p><ActionForm action={saveMtaaSmsSettings} label={t.connectGramvista}>
  <ol className="list-decimal space-y-1 pl-5 text-sm"><li><a className="underline" href="https://sms.gramvistaempiregroup.com/developers" target="_blank" rel="noreferrer">{t.createGramvistaKey}</a></li><li>{t.pasteGramvistaKey}</li><li>{t.connectAndSend}</li></ol>
  <div className="flex flex-wrap gap-3 text-sm"><a className="underline" href="https://sms.gramvistaempiregroup.com" target="_blank" rel="noreferrer">{t.gramvistaPortal}</a><a className="underline" href="https://sms.gramvistaempiregroup.com/buy" target="_blank" rel="noreferrer">{t.gramvistaBuySms}</a></div>
  <label className="block text-sm">{t.smsMode}<select name="mode" defaultValue={smsSetting?.mode||'platform'} className={inputClass}><option value="platform">{t.smsPlatformMode}</option><option value="own">{t.smsOwnMode}</option></select></label>
  <p className="text-sm text-muted-foreground">{t.smsModeHelp}</p>
  <PasswordInput label={t.smsApiKey} name="api_key" autoComplete="new-password" placeholder="gvs_live_..."/>
  <label className="block text-sm">{t.senderIdOptional}<input name="sender_id" maxLength={11} defaultValue={smsSetting?.sender_id||''} placeholder={t.senderAutoPlaceholder} className={inputClass}/></label>
  <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">{t.advancedOptions}</summary><div className="mt-3"><PasswordInput label={t.smsWebhookSecret} name="webhook_secret" autoComplete="new-password" minLength={32}/></div></details>
  <p className="text-sm text-muted-foreground">{t.smsSecretHelp}</p>
 </ActionForm></section>}
 <p className="text-sm text-muted-foreground">{t.smsPending}</p><p className="text-sm text-muted-foreground">{t.paymentPending}</p></div></>;
}
