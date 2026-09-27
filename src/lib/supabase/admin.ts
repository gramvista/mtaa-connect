import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/config/env';

// Use only behind an authorized server boundary: authenticated administration,
// verified workers/webhooks, or the validated and rate-limited public registration flow.
export function createAdminClient() {
 const env = getPublicEnv();
 const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
 if (!secret?.trim()) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required on the server');
 return createClient(env.NEXT_PUBLIC_SUPABASE_URL, secret, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
 });
}
