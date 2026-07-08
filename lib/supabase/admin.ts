import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. SERVER-ONLY: never import this into a client
 * component (the "server-only" import will fail the build if you try).
 *
 * It bypasses RLS, so every call site MUST perform its own authorisation
 * (all current callers run behind requireCompanyAdmin / requirePlatformAdmin).
 * Used for: writing the append-only audit log, provisioning invited auth users,
 * and promoting a profile on invite acceptance.
 *
 * Throws if the service role key is missing so the dependency is never a silent
 * no-op: callers catch and surface it in the UI.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase service role not configured. Set SUPABASE_SERVICE_ROLE_KEY (server-only).",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
