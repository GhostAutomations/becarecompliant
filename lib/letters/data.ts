import "server-only";

/**
 * Reading company letter wording. A company that has never opened the Letters screen
 * has no rows at all, so every read falls back to the packaged default and the app
 * behaves exactly as it did before the feature existed. Nothing is seeded on signup:
 * a row only appears when an Admin saves one.
 */

import { createClient } from "@/lib/supabase/server";
import {
  LETTER_DEFINITIONS,
  letterDefinition,
  type LetterDefinition,
  type LetterKey,
} from "./letters";

export type LetterRow = {
  key: string;
  subject: string;
  body: string;
  version: number;
  updatedAt: string | null;
  /** False when this is the packaged wording rather than something the company saved. */
  customised: boolean;
  definition: LetterDefinition;
};

type StoredLetter = {
  key: string;
  subject: string;
  body: string;
  version: number;
  updated_at: string | null;
};

function withDefaults(def: LetterDefinition, stored: StoredLetter | undefined): LetterRow {
  return {
    key: def.key,
    subject: stored?.subject ?? def.defaultSubject,
    body: stored?.body ?? def.defaultBody,
    version: stored?.version ?? 0,
    updatedAt: stored?.updated_at ?? null,
    customised: Boolean(stored),
    definition: def,
  };
}

/** Every letter the app knows about, with this company's wording where it has any. */
export async function listLetters(companyId: string): Promise<LetterRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_letter_templates")
    .select("key, subject, body, version, updated_at")
    .eq("company_id", companyId);
  const stored = new Map(((data as StoredLetter[] | null) ?? []).map((r) => [r.key, r]));
  return LETTER_DEFINITIONS.map((def) => withDefaults(def, stored.get(def.key)));
}

export async function getLetter(companyId: string, key: LetterKey): Promise<LetterRow | null> {
  const def = letterDefinition(key);
  if (!def) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_letter_templates")
    .select("key, subject, body, version, updated_at")
    .eq("company_id", companyId)
    .eq("key", key)
    .maybeSingle();
  return withDefaults(def, (data as StoredLetter | null) ?? undefined);
}

/**
 * The wording to send with, for code that is already holding a Supabase client (the
 * absence actions run as the Manager who books the meeting, and Managers can read
 * but not write these rows). Falls back to the packaged default on any miss, so a
 * letter can never fail to send because wording is absent.
 */
export async function letterWordingFor(
  supabase: { from: (t: string) => any },
  companyId: string,
  key: LetterKey,
): Promise<{ subject: string; body: string }> {
  const def = letterDefinition(key);
  const fallback = { subject: def?.defaultSubject ?? "", body: def?.defaultBody ?? "" };
  if (!def) return fallback;
  try {
    const { data } = await supabase
      .from("company_letter_templates")
      .select("subject, body")
      .eq("company_id", companyId)
      .eq("key", key)
      .maybeSingle();
    const row = data as { subject: string; body: string } | null;
    if (!row) return fallback;
    return {
      subject: row.subject?.trim() ? row.subject : fallback.subject,
      body: row.body?.trim() ? row.body : fallback.body,
    };
  } catch {
    return fallback;
  }
}

/** Past wording for one letter, newest first. Never deleted: a letter already sent
 *  went out under the wording live at the time, and a process may be challenged
 *  months later. */
export async function letterHistory(
  companyId: string,
  key: string,
): Promise<Array<{ version: number; subject: string; body: string; created_at: string }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_letter_template_versions")
    .select("version, subject, body, created_at, company_letter_templates!inner(key)")
    .eq("company_id", companyId)
    .eq("company_letter_templates.key", key)
    .order("version", { ascending: false })
    .limit(20);
  return ((data as Array<{
    version: number;
    subject: string;
    body: string;
    created_at: string;
  }> | null) ?? []);
}
