import Link from 'next/link';
import { registrationReceipt } from '@/features/registration/session';
import { refreshPublicPayment,startPublicPayment } from '@/features/registration/actions';
import { registrationText as t } from '@/i18n/registration';
import { ActionForm,inputClass } from '@/components/ui/form';
import { paymentProvider } from '@/services/payments/provider';

export const metadata={title:'Malipo | Mtaa Connect',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function RegistrationPayment(){
 let receipt,error=false;
 try{receipt=await registrationReceipt();}catch{error=true;}
 let canPay=false;
 try{const provider=paymentProvider();canPay=!!receipt&&provider.name!=='pending'&&provider.name===receipt.provider;}catch{/* Show the unavailable payment notice. */}
 return <main id="main-content" className="mx-auto max-w-xl space-y-5 px-4 py-10">
  <Link href="/" className="font-bold text-primary">Mtaa Connect</Link><h1 className="text-2xl font-bold">{t.payment}</h1>
  {!receipt?<p role="alert">{error?t.unavailable:t.expiredSession}</p>:<>
   <h2 className="font-semibold">{t.saved}</h2><p>{t.savedMtaa}: <strong>{receipt.mtaa}</strong></p><p className="text-sm text-muted-foreground">{t.noLogin}</p>
   <div className="rounded-xl border bg-card p-5 space-y-3"><p className="text-xl font-bold">{t.fee}</p><p>{receipt.payment_status==='successful'?t.paid:t.awaitingPayment}</p>
    <p>{receipt.registration_status==='approved'?t.approved:receipt.registration_status==='rejected'?t.rejected:t.approval}</p>
    {receipt.expires_at&&<p>{t.expires}: {new Intl.DateTimeFormat('sw-TZ',{dateStyle:'long',timeZone:'Africa/Dar_es_Salaam'}).format(new Date(receipt.expires_at))}</p>}
    {receipt.payment_status==='pending'&&(canPay?<ActionForm action={startPublicPayment} label={t.pay}>
     <label className="block text-sm">{t.paymentPhone}<input className={inputClass} name="payment_phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={receipt.phone} placeholder="0712 345 678" required/></label>
     <p className="text-sm text-muted-foreground">{t.paymentPhoneHelp}</p>
     {receipt.provider==='mock'&&<p>{t.mock}</p>}
    </ActionForm>:<p role="status">{t.providerPending}</p>)}
   </div>
   {receipt.payment_status==='pending'?<ActionForm action={refreshPublicPayment} label={t.refresh}><></></ActionForm>:<a href="/register/payment" className="inline-block rounded-lg border px-4 py-3 font-medium">{t.refresh}</a>}
  </>}
  <Link href="/" className="block text-sm underline">{t.home}</Link>
 </main>;
}
