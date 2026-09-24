"use server";

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getFrameworkReadiness, getFrameworkItems, type RequirementReadiness } from "@/lib/framework/data";
import { runAi } from "@/lib/ai/anthropic";
import { waitingParts, waitingTotal } from "@/lib/framework/waiting";

type Result = { ok: string } | { error: string };

const REG_LABEL: Record<string, string> = {
  ciw: "Care Inspectorate Wales (CIW), Wales",
  cqc: "Care Quality Commission (CQC), England",
};

/** Guard + resolve the company's regulator; returns null if the module is off. */
async function resolve(): Promise<{ companyId: string; regulator: "cqc" | "ciw"; name: string } | null> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("framework_enabled, regulator, name")
    .eq("id", profile.company_id)
    .maybeSingle();
  if (!data?.framework_enabled) return null;
  return { companyId: profile.company_id, regulator: (data.regulator ?? "ciw") as "cqc" | "ciw", name: data.name as string };
}

/** Build a compact, grounded context: readiness per theme plus the page's own list of overdue
 *  and due soon checks. RLS scopes everything to the caller. */
async function buildContext(
  companyId: string,
  regulator: "cqc" | "ciw",
  name: string,
  /** Readiness the caller has ALREADY computed. Readiness now runs the six month PQS engine, so
   *  a caller that has it (the readiness pack PDF) must not make us compute it a second time.
   *  React's cache() does not help here: a route handler sits outside the component tree. */
  pre?: RequirementReadiness[],
): Promise<string> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

  /* THE SAME THEMES AND THE SAME LIST AS THE PAGE (2026-09-24, tested live on Thistle). The
     assistant was given only the OVERDUE checks, so "What needs booking" answered "I do not have
     the individual names, check types or due dates for these 11 checks" about a list the page
     shows in full, and it was given themes nothing feeds, so it reported Environment as having
     no evidence. It now reads the page's own outstanding list (getFrameworkItems), overdue and
     due soon, for the themes the page shows. */
  const requirements = (pre ?? (await getFrameworkReadiness(companyId, regulator)).requirements).filter(
    (r) => r.mapped,
  );
  const items = await getFrameworkItems(companyId, regulator);

  const outstandingLines: string[] = [];
  for (const r of requirements) {
    const it = items.get(r.code);
    if (!it) continue;
    for (const i of it.overdue) {
      outstandingLines.push(`- ${r.title}; ${i.recordName}; ${i.checkName}; due ${ukDate(i.dueDate)}; OVERDUE`);
    }
    for (const i of it.dueSoon) {
      outstandingLines.push(`- ${r.title}; ${i.recordName}; ${i.checkName}; due ${ukDate(i.dueDate)}; due soon`);
    }
  }
  const shown = outstandingLines.slice(0, 80);

  const reqLines = requirements.map((r) => {
    const parts: string[] = [];
    if (r.checks.total > 0) parts.push(`checks ${r.checks.overdue} overdue, ${r.checks.dueSoon} due soon, ${r.checks.onTrack} on track`);
    if (r.checks.unscheduled > 0) parts.push(`${r.checks.unscheduled} checks with no due date, not scored`);
    if (waitingTotal(r.checks.waiting) > 0) {
      parts.push(`${waitingTotal(r.checks.waiting)} waiting on an earlier check (${waitingParts(r.checks.waiting).join(", ")}), not scored`);
    }
    for (const m of r.metrics) parts.push(`${m.label} ${m.pct != null ? `${m.pct}%` : (m.note ?? "no data yet")}`);
    return `- ${r.title} [status: ${STATUS_WORDS[r.status]}]: ${parts.length ? parts.join("; ") : "no evidence mapped"}`;
  });

  return [
    `Regulator: ${REG_LABEL[regulator]}. Provider: ${name}. Date: ${ukDate(today)}.`,
    `Readiness by ${regulator === "ciw" ? "theme" : "key question"}:`,
    ...reqLines,
    shown.length
      ? `Outstanding checks, overdue and due soon (area; record; check; due date; state):`
      : `No overdue or due soon checks.`,
    ...shown,
    ...(outstandingLines.length > shown.length
      ? [`(${outstandingLines.length - shown.length} more due soon are not listed here.)`]
      : []),
  ].join("\n");
}

const STATUS_WORDS: Record<string, string> = {
  red: "Action needed",
  amber: "Attention",
  green: "On track",
  none: "Not mapped",
};

/** 2026-09-17 -> 17 September 2026, for what the model is given and so what it writes. */
function ukDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const SYSTEM = (regulator: string) =>
  `You are an experienced UK care compliance adviser helping a provider prepare for a ${regulator === "ciw" ? "Care Inspectorate Wales (CIW)" : "Care Quality Commission (CQC)"} inspection. Use ONLY the data you are given. Never invent people, facts or figures. Use UK spelling and plain English. Be honest about weaknesses. Make clear this is a preparation aid based on the provider's own live data, not a regulatory rating or legal advice. ${regulator === "ciw" ? "CIW rates each theme separately, by judgement, so never give an overall score, percentage rating or grade for the service. " : ""}Call the things that fall due "checks", never "items". Do not use dashes as punctuation: use commas, colons and full stops. Write plain text, not markdown: no asterisks, no underscores, no # signs. Write dates as they are given to you, for example 17 September 2026. Describe a theme by its status words (On track, Attention, Action needed), never as a colour. Where a figure has no data yet, say "no data yet", never "n/a".`;

/** Draft an inspection readiness narrative + prioritised gaps and actions. */
export async function draftReadinessNarrative(pre?: RequirementReadiness[]): Promise<Result> {
  const ctx = await resolve();
  if (!ctx) return { error: "Inspection Readiness is not enabled for this company." };
  const context = await buildContext(ctx.companyId, ctx.regulator, ctx.name, pre);
  /* DEF-066: the pack already prints the provider, regulator and date on its cover, so the model
     starts straight at the first section, and headings go on a line of their own marked with ##
     so the pack can tell them apart. Anything else markdown is cleaned off by narrative-text. */
  const prompt = `${context}\n\nWrite two sections. Do not add a title, provider, date or disclaimer of your own: the document already has them. Put each section heading on its own line starting with "## ", and each ${ctx.regulator === "ciw" ? "theme" : "key question"} name on its own line followed by a colon and its status.\n## Readiness summary: for each ${ctx.regulator === "ciw" ? "theme" : "key question"}, 2 to 4 sentences on what is strong and what needs attention.\n## Gaps and actions: a numbered list, most urgent first, each action specific and tied to the data above (name the records and checks where relevant).`;
  return runAi({ companyId: ctx.companyId, feature: "framework_narrative", system: SYSTEM(ctx.regulator), prompt, maxTokens: 3500 });
}

/** Answer a manager's question grounded in the readiness data. */
export async function askReadiness(question: string): Promise<Result> {
  const q = (question ?? "").trim();
  if (!q) return { error: "Type a question first." };
  const ctx = await resolve();
  if (!ctx) return { error: "Inspection Readiness is not enabled for this company." };
  const context = await buildContext(ctx.companyId, ctx.regulator, ctx.name);
  const prompt = `${context}\n\nThe manager asks: "${q}"\nAnswer using ONLY the data above. If the answer is not in the data, say you do not have that information. Be concise and specific, and refer to the exact records or checks where relevant.`;
  return runAi({ companyId: ctx.companyId, feature: "framework_qa", system: SYSTEM(ctx.regulator), prompt, maxTokens: 900 });
}
