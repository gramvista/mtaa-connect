import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/config/env";

export async function createClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  // This is a per-request user-scoped client, not a service-role client.
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. The proxy handles refresh.
        }
      },
    },
  });
}
