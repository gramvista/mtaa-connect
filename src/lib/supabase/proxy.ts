import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/config/env";

export async function updateSession(request: NextRequest) {
  let env;
  try { env = getPublicEnv(); } catch {
    // Only configuration help can render without credentials; data routes fail closed.
    if (request.nextUrl.pathname === '/login') return NextResponse.next({ request });
    return NextResponse.redirect(new URL('/login', request.url));
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Token verification/refresh only. Every data route/action checks the live profile.
  await supabase.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
