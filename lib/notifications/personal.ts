import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ActivityRow } from "@/lib/notifications/activity";

/**
 * The signed in person's own notifications for the Recent activity tile (0473, Phil 2026-10-14),
 * newest first, Removed ones left out. Read through their own client: RLS returns only their own
 * rows, and the names of the records come back only where they may open the record.
 *
 * Returns null when the read FAILS, so the tile says so instead of drawing a wrong "Nothing new".
 */
export async function getMyNotifications(profileId: string, limit = 10): Promise<ActivityRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_notifications")
    .select("id, person_id, service_user_id, evidence_id, concern_id, actor_name, completed_on, created_at, definition:check_definitions(name), branch:branches(name)")
    .eq("profile_id", profileId)
    // Email only notifications (0474) are not shown here.
    .eq("show_in_app", true)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return null;
  type Row = {
    id: string;
    person_id: string | null;
    service_user_id: string | null;
    evidence_id: string | null;
    concern_id: string | null;
    actor_name: string | null;
    completed_on: string | null;
    created_at: string;
    definition: { name: string } | null;
    branch: { name: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const suIds = [...new Set(rows.map((r) => r.service_user_id).filter((x): x is string => !!x))];
  const personIds = [...new Set(rows.map((r) => r.person_id).filter((x): x is string => !!x))];
  const [sus, people] = await Promise.all([
    suIds.length ? supabase.from("service_users").select("id, full_name").in("id", suIds) : Promise.resolve({ data: [] }),
    personIds.length ? supabase.from("people").select("id, full_name").in("id", personIds) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map<string, string>();
  for (const r of [...((sus.data ?? []) as Array<{ id: string; full_name: string }>), ...((people.data ?? []) as Array<{ id: string; full_name: string }>)]) {
    names.set(r.id, r.full_name);
  }
  return rows.map((r) => {
    const recordId = (r.person_id ?? r.service_user_id) as string;
    return {
      id: r.id,
      checkName: r.definition?.name ?? "Check",
      recordName: names.get(recordId) ?? null,
      recordKind: r.person_id ? "person" : "service_user",
      recordId,
      evidenceId: r.evidence_id,
      actorName: r.actor_name,
      branchName: r.branch?.name ?? null,
      completedOn: r.completed_on,
      createdAt: r.created_at,
      concernId: r.concern_id,
    };
  });
}
