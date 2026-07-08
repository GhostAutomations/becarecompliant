import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client for Client Components (Realtime, client reads). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
