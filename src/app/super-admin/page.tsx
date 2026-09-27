import { redirect } from 'next/navigation';
import { requireAdmin } from '@/features/auth/context';
export const dynamic='force-dynamic';
export default async function SuperAdminPage(){await requireAdmin(true);redirect('/admin');}
