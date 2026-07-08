/**
 * Absolute base URL of the app, used for links in customer emails and for
 * Supabase auth redirect targets. Set NEXT_PUBLIC_SITE_URL in production
 * (e.g. https://www.becarecompliant.com); falls back to the Vercel URL, then
 * localhost for local dev.
 */
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
