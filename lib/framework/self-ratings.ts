import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * The manager's OWN rating of each theme (0374, Phil 2026-10-02). CIW invites providers to rate
 * themselves against its descriptors (framework paragraph 17; quality of care review guidance),
 * and the app never predicts the inspector's word (Phil, 2026-09-19). Append only: the latest row
 * for a theme is the rating, the rows before it are its history. Read through the caller's RLS.
 */
export type SelfRating = {
  rating: string;
  note: string | null;
  setByName: string;
  createdAt: string;
};

export async function getSelfRatings(
  companyId: string,
  regulator: "ciw" | "cqc",
  branchId: string | null,
): Promise<Map<string, { latest: SelfRating; history: SelfRating[] }>> {
  const supabase = await createClient();
  let q = supabase
    .from("readiness_self_ratings")
    .select("requirement_code, rating, note, set_by_name, created_at")
    .eq("company_id", companyId)
    .eq("regulator", regulator)
    .order("created_at", { ascending: false })
    .limit(500);
  q = branchId ? q.eq("branch_id", branchId) : q.is("branch_id", null);
  const { data } = await q;
  const out = new Map<string, { latest: SelfRating; history: SelfRating[] }>();
  for (const r of (data as Array<{ requirement_code: string; rating: string; note: string | null; set_by_name: string; created_at: string }> | null) ?? []) {
    const row: SelfRating = { rating: r.rating, note: r.note, setByName: r.set_by_name, createdAt: r.created_at };
    const cur = out.get(r.requirement_code);
    if (!cur) out.set(r.requirement_code, { latest: row, history: [] });
    else if (cur.history.length < 10) cur.history.push(row);
  }
  return out;
}
