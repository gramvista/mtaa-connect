import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAppOrigin, safeCallbackDestination } from "@/features/auth/urls";

const otpTypes = new Set<EmailOtpType>(["email", "signup", "invite", "magiclink", "recovery", "email_change"]);

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const destination = safeCallbackDestination(incoming.searchParams.get("next"));
  const client = await createClient();
  const code = incoming.searchParams.get("code");
  const tokenHash = incoming.searchParams.get("token_hash");
  const suppliedType = incoming.searchParams.get("type") as EmailOtpType | null;

  let error: unknown;
  if (code) {
    ({ error } = await client.auth.exchangeCodeForSession(code));
  } else if (tokenHash && suppliedType && otpTypes.has(suppliedType)) {
    ({ error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: suppliedType }));
  } else {
    error = new Error("Missing authentication token");
  }

  if (error) return NextResponse.redirect(new URL("/login?error=confirmation", getAppOrigin()));
  if (destination === "/reset-password") {
    return NextResponse.redirect(new URL(destination, getAppOrigin()));
  }

  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?error=confirmation", getAppOrigin()));
  const { data: profile } = await client.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (!profile || profile.status !== "active") {
    await client.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=unauthorized", getAppOrigin()));
  }
  return NextResponse.redirect(new URL(profile.role === "agent" ? "/agent" : "/admin", getAppOrigin()));
}
