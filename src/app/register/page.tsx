import Link from 'next/link';
import { connection } from 'next/server';
import { RegistrationForm } from '@/components/registration/registration-form';
import { registrationText as t } from '@/i18n/registration';
import { createAdminClient } from '@/lib/supabase/admin';
export const metadata={title:'Jisajili | Mtaa Connect'};
export default async function Register(){
 await connection();
 const db=createAdminClient();
 const [regions,occupations]=await Promise.all([
  db.from('regions').select('id,name').order('name').limit(500),
  db.from('occupations').select('code,name,requires_detail,sort_order').eq('status','active').order('sort_order').limit(100),
 ]);
 if(regions.error||occupations.error)throw new Error(t.unavailable);
 return <main id="main-content" className="mx-auto max-w-2xl px-4 py-8 sm:py-12"><Link href="/" className="text-primary font-bold">Mtaa Connect</Link><h1 className="mt-6 text-3xl font-bold">{t.title}</h1><p className="mt-3 mb-8 text-muted-foreground">{t.intro}</p><RegistrationForm regions={regions.data??[]} occupations={occupations.data??[]}/></main>;
}
