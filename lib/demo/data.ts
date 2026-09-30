import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { demoPhase, type DemoPhase } from "@/lib/demo/rules";

export type CompanyDemo = { id: string; endsAt: string; phase: DemoPhase; clientName: string };

/**
 * Is this company a demo (0356), and where is it? One read per request. Company members may read
 * their own demo row (RLS), which is all the guard, the banner and the nav need. Null means a
 * real company, and so does a read that did not answer: a query failing must never lock a real
 * customer out, and a demo that cannot be read is still stopped by the database for AI and logins.
 */
export const getCompanyDemo = cache(async (companyId: string | null | undefined): Promise<CompanyDemo | null> => {
  if (!companyId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("demos")
    .select("id, ends_at, client_name")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; ends_at: string; client_name: string };
  return { id: row.id, endsAt: row.ends_at, phase: demoPhase(row.ends_at), clientName: row.client_name };
});

/** The signed in person's demo login (AI used and allowed), or null when they are not one. */
export const getMyDemoLogin = cache(async (userId: string): Promise<{ id: string; aiUsed: number; aiAllowance: number } | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("demo_logins")
    .select("id, ai_used, ai_allowance")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const r = data as { id: string; ai_used: number; ai_allowance: number };
  return { id: r.id, aiUsed: r.ai_used, aiAllowance: r.ai_allowance };
});

/** The refusal every login, role and billing action gives inside a demo. */
export const DEMO_REFUSAL =
  "This is a demo account, so logins, roles and billing are switched off. Talk to us and we will set up your own account.";

/** True when the company is a demo: for server actions that must refuse (logins, roles, billing). */
export async function isDemoCompany(companyId: string | null | undefined): Promise<boolean> {
  return (await getCompanyDemo(companyId)) !== null;
}

/**
 * The same question from code with no signed in user (the SMS sender runs from crons and
 * webhooks too). Read with the service client; a failed read answers false, since this is not
 * the only lock on a demo.
 */
export async function isDemoCompanyAnyContext(companyId: string): Promise<boolean> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const { data } = await createServiceClient()
      .from("demos")
      .select("id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

export const DEMO_NO_SMS = "SMS is switched off in demo accounts, so nothing was sent.";
