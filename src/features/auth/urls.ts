export const PRODUCTION_APP_ORIGIN = "https://mtaa.gramvistaempiregroup.com";

const callbackDestinations = new Set(["/admin", "/agent", "/reset-password"]);

export function normalizeAppOrigin(value: string, production = process.env.NODE_ENV === "production") {
  const origin = new URL(value).origin;
  if (production && origin !== PRODUCTION_APP_ORIGIN) {
    throw new Error("NEXT_PUBLIC_APP_URL must use the production Mtaa Connect domain");
  }
  return origin;
}

export function getAppOrigin() {
  if (process.env.NODE_ENV === "production") return PRODUCTION_APP_ORIGIN;
  const value = process.env.NEXT_PUBLIC_APP_URL;
  if (!value) throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  return normalizeAppOrigin(value);
}

export function callbackUrl(next: string) {
  const safeNext = safeCallbackDestination(next);
  const url = new URL("/auth/callback", getAppOrigin());
  url.searchParams.set("next", safeNext);
  return url.toString();
}

export function safeCallbackDestination(value: string | null) {
  return value && callbackDestinations.has(value) ? value : "/admin";
}
