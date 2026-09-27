import Link from 'next/link';
import { requireAdmin } from '@/features/auth/context';
import { logout } from '@/features/auth/actions';
import { adminText as t } from '@/i18n/admin';
export const dynamic='force-dynamic';
export default async function AdminLayout({children}:{children:React.ReactNode}) {
 const {profile}=await requireAdmin();
 const links=[['/admin',t.dashboard],['/admin/residents',t.residents],['/admin/locations',t.locations],['/admin/groups',t.groupings],['/admin/campaigns',t.campaigns],['/admin/subscriptions',t.subscriptions],['/admin/audit',t.audit],['/admin/settings',t.settings]];
 if(profile.role==='super_admin') links.splice(3,0,['/admin/administrators',t.administrators]);
 return <div className="min-h-screen lg:grid lg:grid-cols-[230px_1fr]">
  <aside className="border-b bg-primary p-5 text-primary-foreground lg:min-h-screen lg:border-b-0">
   <Link href="/admin" className="text-xl font-bold">{t.brand}</Link><p className="mt-2 text-xs opacity-80">{t[profile.role]}</p>
   <nav aria-label={t.brand} className="mt-6 flex flex-wrap gap-2 lg:flex-col">{links.map(([href,label])=><Link key={href} href={href} className="rounded-lg px-3 py-2 text-sm hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white">{label}</Link>)}</nav>
  </aside>
  <div className="min-w-0"><header className="flex items-center justify-between gap-4 border-b px-5 py-4 sm:px-8"><p className="text-sm font-medium">{profile.full_name}</p><form action={logout}><button className="min-h-10 px-3 text-sm underline">{t.logout}</button></form></header>
   <main id="main-content" className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">{children}</main>
  </div>
 </div>;
}
