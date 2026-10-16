import "server-only";
import { createClient } from "@/lib/supabase/server";
import { callSlots, type ScheduleEntry } from "@/lib/rota/calls";
import type { TaskItem } from "@/lib/rota/tasks";

/**
 * Be Care Compliant: a service user's tasks per call, for the Care plan page (Rota and Visits
 * Stage 4). Read under the office's own RLS: task lists follow the Care Schedule's rule (0309).
 * Only called when the company has Rota and Visits on.
 */

export type CallTasks = {
  dayOfWeek: number;
  service: string;
  slotKey: string;
  occurrence: number;
  startTime: string | null;
  listId: string | null;
  tasks: TaskItem[];
  savedAt: string | null;
};

export async function getSuCallTasks(serviceUserId: string, entries: ScheduleEntry[]): Promise<CallTasks[]> {
  const calls = callSlots(entries);
  if (calls.length === 0) return [];
  const supabase = await createClient();
  const [{ data: lists }, { data: times }] = await Promise.all([
    supabase
      .from("rota_call_task_lists")
      .select("id, day_of_week, service, slot_key, occurrence, tasks, created_at")
      .eq("service_user_id", serviceUserId)
      .is("replaced_at", null),
    supabase.from("rota_call_times").select("day_of_week, service, slot_key, occurrence, start_time").eq("service_user_id", serviceUserId),
  ]);
  type L = { id: string; day_of_week: number; service: string; slot_key: string; occurrence: number; tasks: TaskItem[]; created_at: string };
  type T = { day_of_week: number; service: string; slot_key: string; occurrence: number; start_time: string | null };
  const key = (d: number, s: string, k: string, o: number) => `${d}|${s}|${k}|${o}`;
  const listMap = new Map(((lists as L[] | null) ?? []).map((l) => [key(l.day_of_week, l.service, l.slot_key, l.occurrence), l]));
  const timeMap = new Map(((times as T[] | null) ?? []).map((t) => [key(t.day_of_week, t.service, t.slot_key, t.occurrence), t]));
  return calls.map((c) => {
    const k = key(c.dayOfWeek, c.service, c.slotKey, c.occurrence);
    const l = listMap.get(k);
    const t = timeMap.get(k);
    return {
      dayOfWeek: c.dayOfWeek,
      service: c.service,
      slotKey: c.slotKey,
      occurrence: c.occurrence,
      startTime: t?.start_time ? t.start_time.slice(0, 5) : null,
      listId: l?.id ?? null,
      tasks: Array.isArray(l?.tasks) ? l!.tasks : [],
      savedAt: l?.created_at ?? null,
    };
  });
}

/** The company's own custom tasks (beside the starter list). */
export async function getTaskLibrary(companyId: string): Promise<{ id: string; name: string; category: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rota_task_library")
    .select("id, name, category")
    .eq("company_id", companyId)
    .is("archived_at", null)
    .order("name");
  return (data as { id: string; name: string; category: string }[] | null) ?? [];
}
