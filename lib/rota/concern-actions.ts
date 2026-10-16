"use server";

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/forms";
import { rotaModuleOn } from "@/lib/rota/access";

/**
 * Be Care Compliant: the office deciding a concern (Rota and Visits Stage 5, Phil 2026-10-16;
 * docs/decisions/rota-visits.md, Stage 5 decision 9). The supervisor decides whether an incident
 * form is needed: "Start an incident form" opens Report an incident filled in from the concern (and
 * links it when filed); "No incident form needed" records why. The database checks the caller is
 * the rota office of the concern's branch, and writes the audit line.
 */

const UUID = /^[0-9a-f-]{36}$/i;

export async function concernDecideAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id || !(await rotaModuleOn(profile.company_id))) return { error: "Concerns are not available." };
  const id = String(fd.get("concern_id") ?? "");
  const decision = String(fd.get("decision") ?? "");
  const note = String(fd.get("note") ?? "").trim();
  if (!UUID.test(id)) return { error: "That concern could not be found." };
  if (decision !== "no_incident" && decision !== "open") return { error: "That is not a decision." };
  if (decision === "no_incident" && !note) return { error: "Say why no incident form is needed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_concern_decide", { p_concern: id, p_decision: decision, p_note: note });
  if (error) return { error: error.message };
  return { ok: decision === "open" ? "Reopened" : "Saved" };
}
