import Link from 'next/link';
import { requireAgent } from '@/features/auth/context';
import { logout } from '@/features/auth/actions';
import { adminText as t } from '@/i18n/admin';

export const dynamic='force-dynamic';
export default async function AgentLayout({children}:{children:React.ReactNode}){
 const {profile,mtaa}=await requireAgent();
 return <div className="min-h-screen lg:grid lg:grid-cols-[230px_1fr]">
  <aside className="border-b bg-primary p-5 text-primary-foreground lg:min-h-screen lg:border-b-0"><Link href="/agent" className="text-xl font-bold">{t.brand}</Link><p className="mt-2 text-xs opacity-80">{t.agent} · {mtaa.name}</p><nav className="mt-6 flex flex-wrap gap-2 lg:flex-col"><Link className="rounded-lg px-3 py-2 text-sm hover:bg-white/15" href="/agent">{t.agentDashboard}</Link><Link className="rounded-lg px-3 py-2 text-sm hover:bg-white/15" href="/agent/register">{t.agentRegister}</Link><Link className="rounded-lg px-3 py-2 text-sm hover:bg-white/15" href="/agent/settings">{t.settings}</Link></nav></aside>
  <div className="min-w-0"><header className="flex items-center justify-between border-b px-5 py-4 sm:px-8"><p className="text-sm font-medium">{profile.full_name}</p><form action={logout}><button className="min-h-10 px-3 text-sm underline">{t.logout}</button></form></header><main className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">{children}</main></div>
 </div>;
}
