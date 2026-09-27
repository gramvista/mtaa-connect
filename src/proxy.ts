import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Only auth and administrator data routes need session refresh.
export const config = {
  matcher: ["/admin/:path*", "/agent/:path*", "/super-admin/:path*", "/login", "/auth/:path*", "/api/locations", "/api/resident-options"],
};
