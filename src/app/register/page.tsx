import Link from 'next/link';
import { RegistrationForm } from '@/components/registration/registration-form';
import { registrationText as t } from '@/i18n/registration';
export const metadata={title:'Jisajili | Mtaa Connect'};
export default function Register(){
 return <main id="main-content" className="mx-auto max-w-2xl px-4 py-8 sm:py-12"><Link href="/" className="text-primary font-bold">Mtaa Connect</Link><h1 className="mt-6 text-3xl font-bold">{t.title}</h1><p className="mt-3 mb-8 text-muted-foreground">{t.intro}</p><RegistrationForm/></main>;
}
