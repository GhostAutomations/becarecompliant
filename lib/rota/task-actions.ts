"use server";

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { rotaModuleOn } from "@/lib/rota/access";
import { cleanTaskList, type TaskItem } from "@/lib/rota/tasks";

/**
 * Be Care Compliant: the office's task actions (Rota and Visits Stage 4, Phil 2026-10-16). Who may
 * change tasks is who may change the Care Schedule (the database checks it in every function).
 * Every save is a new version (the old one is kept) and is recorded in the audit log. Like the
 * other rota actions, they reply with their result only and the screen refreshes itself.
 */

const UUID = /^[0-9a-f-]{36}$/i;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function guard() {
  const { user, profile } = await requireCompany();
  const companyId = profile.company_id;
  if (!companyId || !(await rotaModuleOn(companyId))) return { error: "Tasks are not available." as const };
  return { user, profile, companyId };
}

type CallKey = { day: number; service: string; slot: string; occurrence: number };

function readKey(fd: FormData, prefix = ""): CallKey | null {
  const day = Number(str(fd, `${prefix}day_of_week`));
  const occurrence = Number(str(fd, `${prefix}occurrence`));
  const service = str(fd, `${prefix}service`);
  if (!(day >= 0 && day <= 6) || !(occurrence >= 1 && occurrence <= 20) || !service) return null;
  return { day, service, slot: str(fd, `${prefix}slot_key`), occurrence };
}

function readTasks(raw: string): TaskItem[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return cleanTaskList(
      parsed.map((t) => {
        const o = (t ?? {}) as Record<string, unknown>;
        return { uid: typeof o.uid === "string" ? o.uid : undefined, name: String(o.name ?? ""), category: String(o.category ?? "Custom"), key: o.key === true };
      }),
    );
  } catch {
    return null;
  }
}

async function save(su: string, k: CallKey, tasks: TaskItem[]) {
  const supabase = await createClient();
  return supabase.rpc("rota_save_call_tasks", {
    p_su: su, p_day: k.day, p_service: k.service, p_slot: k.slot, p_occurrence: k.occurrence, p_tasks: tasks,
  });
}

export async function saveCallTasksAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const su = str(fd, "service_user_id");
  const k = readKey(fd);
  const tasks = readTasks(str(fd, "tasks"));
  if (!UUID.test(su) || !k) return { error: "That call could not be found." };
  if (!tasks) return { error: "The task list could not be read. Refresh the page and try again." };
  const { error } = await save(su, k, tasks);
  if (error) return { error: error.message };
  await writeAudit({
    companyId: g.companyId,
    action: "rota.call_tasks_saved",
    entityType: "service_user",
    entityId: su,
    summary: `Tasks saved for a call (${tasks.length} task${tasks.length === 1 ? "" : "s"}, ${tasks.filter((t) => t.key).length} key)`,
    metadata: { day_of_week: k.day, service: k.service, slot_key: k.slot, occurrence: k.occurrence, tasks: tasks.map((t) => t.name) },
  });
  return { ok: tasks.length ? "Tasks saved." : "Tasks cleared." };
}

/** Copy one call's tasks to other calls (each becomes a new version of that call's list). */
export async function copyCallTasksAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const su = str(fd, "service_user_id");
  const tasks = readTasks(str(fd, "tasks"));
  const targets = fd.getAll("target").map(String);
  if (!UUID.test(su)) return { error: "That service user could not be found." };
  if (!tasks) return { error: "The task list could not be read. Refresh the page and try again." };
  if (targets.length === 0) return { error: "Tick the calls to copy the tasks to." };
  let done = 0;
  for (const t of targets) {
    const [day, service, slot, occurrence] = t.split("|");
    const k: CallKey = { day: Number(day), service, slot: slot ?? "", occurrence: Number(occurrence) };
    if (!(k.day >= 0 && k.day <= 6) || !k.service || !(k.occurrence >= 1)) continue;
    // Each call keeps its own task ids, so a copy is a fresh list for that call.
    const { error } = await save(su, k, tasks.map(({ uid: _u, ...rest }) => rest));
    if (error) return { error: `${done} copied, then: ${error.message}` };
    done += 1;
  }
  await writeAudit({
    companyId: g.companyId,
    action: "rota.call_tasks_copied",
    entityType: "service_user",
    entityId: su,
    summary: `Tasks copied to ${done} other call${done === 1 ? "" : "s"}`,
    metadata: { targets, tasks: tasks.map((t) => t.name) },
  });
  return { ok: `Copied to ${done} call${done === 1 ? "" : "s"}.` };
}

export async function addLibraryTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const name = str(fd, "name").replace(/\s+/g, " ");
  if (!name) return { error: "Type the task." };
  if (name.length > 120) return { error: "Keep the task under 120 characters." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_add_library_task", { p_company: g.companyId, p_name: name, p_category: str(fd, "category") || "Custom" });
  if (error) return { error: error.message };
  await writeAudit({ companyId: g.companyId, action: "rota.task_library_added", entityType: "company", entityId: g.companyId, summary: `Custom task added: ${name}` });
  return { ok: "Added to your company's tasks." };
}

export async function archiveLibraryTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const id = str(fd, "task_id");
  if (!UUID.test(id)) return { error: "That task could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_archive_library_task", { p_id: id });
  if (error) return { error: error.message };
  await writeAudit({ companyId: g.companyId, action: "rota.task_library_removed", entityType: "company", entityId: g.companyId, summary: "Custom task removed from the company's list" });
  return { ok: "Removed." };
}
