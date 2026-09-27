import { z } from "zod";

const httpUrl = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Must be an HTTP(S) URL without embedded credentials");

// Reject secret keys and legacy service-role JWTs in browser-visible configuration.
const publicKey = z.string().trim().min(1).refine((value) => {
  if (value.startsWith("sb_publishable_")) return value.length > 20;
  try {
    const payload = value.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return value.split(".").length === 3 && decoded.role === "anon";
  } catch {
    return false;
  }
}, "Use a Supabase public publishable key or legacy anon key, never a secret/service-role key");

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
  NEXT_PUBLIC_APP_URL: httpUrl,
});

export function parsePublicEnv(input: Record<string, unknown>) {
  const result = publicEnvSchema.safeParse(input);
  if (!result.success) {
    // Never include supplied values (which could contain secrets) in errors.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid or missing environment variables: ${fields.join(", ")}. See .env.example.`);
  }
  return result.data;
}
