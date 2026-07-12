"use server";

/**
 * Be Care Compliant — Settings > Absence server actions (Company Admin only).
 *
 *   saveAbsenceConfig    : method (stages | bradford), rolling window, thresholds.
 *   uploadAbsencePolicy  : store the company policy in the private bucket.
 *   suggestAbsencePolicy : send the uploaded policy to Anthropic and return a
 *                          suggested method + thresholds for the Admin to confirm.
 *
 * AI is opt-in per Phil's choice. It degrades gracefully: if ANTHROPIC_API_KEY /
 * ANTHROPIC_MODEL are missing, or the policy is not a PDF, it surfaces a clear
 * message rather than failing silently. Formal per-company AI usage metering
 * (the Diamond tier meter) is a Phase 6 item; for now usage is written to audit.
 */

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { recordUsage } from "@/lib/notifications/usage";
import { requireFeature } from "@/lib/billing/tier";
import type { ActionState } from "@/lib/forms";

const POLICY_BUCKET = "absence-policies";

export async function saveAbsenceConfig(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };

  const method = String(formData.get("method") ?? "stages");
  if (method !== "stages" && method !== "bradford") {
    return { error: "Choose a tracking method." };
  }
  const windowDays = Number.parseInt(String(formData.get("rolling_window_days") ?? ""), 10);
  if (!Number.isInteger(windowDays) || windowDays < 1) {
    return { error: "Enter the rolling window in days." };
  }

  let thresholds: unknown;
  try {
    thresholds = JSON.parse(String(formData.get("thresholds") ?? "[]"));
  } catch {
    return { error: "The thresholds could not be read." };
  }
  if (!Array.isArray(thresholds)) return { error: "Thresholds must be a list." };

  const supabase = await createClient();
  const { error } = await supabase.from("absence_config").upsert(
    {
      company_id: profile.company_id,
      method,
      rolling_window_days: windowDays,
      thresholds,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence_config.updated",
    entityType: "company",
    entityId: profile.company_id,
    summary: `Set absence tracking to ${method}`,
    metadata: { method, rolling_window_days: windowDays },
  });

  revalidatePath("/settings/absence");
  revalidatePath("/people/absence");
  return { ok: "Saved" };
}

export async function uploadAbsencePolicy(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };
  const companyId = profile.company_id;

  const file = formData.get("policy");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a policy file to upload." };
  }
  if (file.size > 15 * 1024 * 1024) return { error: "The file must be under 15 MB." };

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${companyId}/policy-${Date.now()}-${safe}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const supabase = await createClient();
  const { error: upErr } = await supabase.storage
    .from(POLICY_BUCKET)
    .upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) return { error: upErr.message };

  const { error } = await supabase.from("absence_config").upsert(
    {
      company_id: companyId,
      policy_path: path,
      policy_uploaded_at: new Date().toISOString(),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );
  if (error) return { error: error.message };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence_policy.uploaded",
    entityType: "company",
    entityId: companyId,
    summary: "Uploaded the company absence policy",
    metadata: { path, content_type: file.type },
  });

  revalidatePath("/settings/absence");
  return { ok: "Policy uploaded." };
}

/**
 * Ask Anthropic to read the uploaded policy and suggest the tracking method +
 * thresholds. Returns the suggestion as a JSON string in `ok` for the client to
 * pre-fill; nothing is saved until the Admin confirms with Save.
 */
export async function suggestAbsencePolicy(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireCompanyAdmin();
  if (!profile.company_id) return { error: "No company context." };

  // AI assistance is an Enterprise and above feature (server-side tier gating).
  const gated = await requireFeature(profile.company_id, "ai_features");
  if (gated) return { error: gated };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) {
    return {
      error:
        "AI is not configured. Set ANTHROPIC_API_KEY and ANTHROPIC_MODEL in the environment to enable policy suggestions.",
    };
  }

  const supabase = await createClient();
  const { data: cfg } = await supabase
    .from("absence_config")
    .select("policy_path")
    .eq("company_id", profile.company_id)
    .maybeSingle();
  const path = (cfg?.policy_path as string | null) ?? null;
  if (!path) return { error: "Upload a policy first, then ask AI to read it." };

  const { data: blob, error: dlErr } = await supabase.storage
    .from(POLICY_BUCKET)
    .download(path);
  if (dlErr || !blob) return { error: "The uploaded policy could not be read." };
  if (blob.type && !blob.type.includes("pdf")) {
    return { error: "AI suggestions currently support PDF policies. Upload the policy as a PDF." };
  }

  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

  const prompt = [
    "You are configuring an absence-tracking system for a UK care company.",
    "Read the attached absence policy and decide how absence should be tracked.",
    "Return ONLY valid JSON, no prose, matching exactly:",
    '{"method":"stages"|"bradford","rolling_window_days":number,"thresholds":[...],"summary":"one sentence"}',
    'For "stages" each threshold is {"stage":1,"label":"Stage 1","occasions":3}.',
    'For "bradford" each threshold is {"threshold":51,"label":"Stage 1","action":"Informal discussion"}.',
    "A Return to Work interview is conducted after EVERY absence, at every stage/level regardless of the stage; state this clearly in the summary.",
    "If the policy does not specify numbers, use sensible UK care-sector defaults and say so in the summary.",
  ].join(" ");

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    return { error: `Could not reach the AI service: ${(e as Error).message}` };
  }

  if (!res.ok) {
    // Redact anything that looks like a secret before surfacing (defence in depth:
    // e.g. a misconfigured ANTHROPIC_MODEL echoing the key back in the error body).
    const detail = (await res.text().catch(() => "")).replace(
      /sk-ant-[A-Za-z0-9_-]{6,}/g,
      "sk-ant-***",
    );
    const hint =
      res.status === 404
        ? " Check ANTHROPIC_MODEL is a valid model name (e.g. claude-sonnet-5)."
        : "";
    return { error: `AI request failed (${res.status}).${hint} ${detail.slice(0, 160)}` };
  }

  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = json.content?.find((c) => c.type === "text")?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { error: "The AI response could not be parsed. Try again or set the thresholds manually." };

  let suggestion: unknown;
  try {
    suggestion = JSON.parse(match[0]);
  } catch {
    return { error: "The AI response was not valid JSON. Set the thresholds manually." };
  }

  // Store a short human summary + meter usage via audit (formal metering = Phase 6).
  const summary =
    typeof (suggestion as { summary?: unknown }).summary === "string"
      ? ((suggestion as { summary: string }).summary)
      : null;
  await supabase
    .from("absence_config")
    .upsert(
      {
        company_id: profile.company_id,
        policy_ai_summary: summary,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "absence_policy.ai_parsed",
    entityType: "company",
    entityId: profile.company_id,
    summary: "AI suggested absence settings from the policy",
    metadata: {
      input_tokens: json.usage?.input_tokens ?? null,
      output_tokens: json.usage?.output_tokens ?? null,
      model,
    },
  });

  // Formal per-company AI metering (Phase 6): units = total tokens.
  const inputTokens = json.usage?.input_tokens ?? 0;
  const outputTokens = json.usage?.output_tokens ?? 0;
  await recordUsage({
    companyId: profile.company_id,
    kind: "ai",
    units: inputTokens + outputTokens,
    metadata: {
      feature: "absence_policy_parse",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      model,
      unit: "tokens",
    },
  });

  return { ok: JSON.stringify(suggestion) };
}
