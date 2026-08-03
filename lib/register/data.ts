import "server-only";

/**
 * Be Care Compliant — register custom columns data (Item 6). Lists a company's active,
 * non-curated check definitions for a population, in the Admin-set order (register_position,
 * nulls last, then sort_order then name), each carrying the questions its column may be pointed
 * at. RLS-scoped via the user client. Returns every such check (including hidden ones) so the
 * Columns panel can re-show them; the matrix filters to `show`.
 */

import { createClient } from "@/lib/supabase/server";
import type { FormSchema } from "@/lib/form-schema";
import { formatDisplayDate } from "@/lib/people/logic";
import {
  columnAnswerText,
  displayChoices,
  isCuratedCheckKey,
  type RegisterCheckColumn,
} from "./custom-columns";

/** Published schemas for a set of forms, keyed by form id. */
async function publishedSchemas(formIds: string[]): Promise<Record<string, FormSchema>> {
  if (formIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_versions")
    .select("form_id, version, schema")
    .in("form_id", formIds)
    .eq("status", "published")
    .order("version", { ascending: true });

  const out: Record<string, FormSchema> = {};
  // Ascending order means the last write wins, which is the highest published version.
  for (const row of (data as Array<{ form_id: string; schema: FormSchema }> | null) ?? []) {
    out[row.form_id] = row.schema;
  }
  return out;
}

export async function listRegisterCheckColumns(
  companyId: string,
  population: "people" | "service_users",
): Promise<RegisterCheckColumn[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("check_definitions")
    .select("id, key, name, form_id, show_on_register, register_position, sort_order, register_display_field_key")
    .eq("company_id", companyId)
    .eq("population", population)
    .eq("active", true);

  const rows =
    (data as Array<{
      id: string;
      key: string;
      name: string;
      form_id: string | null;
      show_on_register: boolean;
      register_position: number | null;
      sort_order: number;
      register_display_field_key: string | null;
    }> | null) ?? [];

  const ordered = rows
    .filter((r) => !isCuratedCheckKey(population, r.key))
    .sort((a, b) => {
      // Positioned columns first (in position order), then the rest by sort_order/name.
      const ap = a.register_position;
      const bp = b.register_position;
      if (ap != null && bp != null) return ap - bp;
      if (ap != null) return -1;
      if (bp != null) return 1;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name.localeCompare(b.name);
    });

  const schemas = await publishedSchemas(
    [...new Set(ordered.map((r) => r.form_id).filter((id): id is string => Boolean(id)))],
  );

  return ordered.map((r) => {
    const choices = r.form_id ? displayChoices(schemas[r.form_id]) : [];
    /*
     * A question the column points at can DISAPPEAR when somebody republishes the form without it.
     * Left as it is, the dropdown shows blank, the cells show nothing, and every future save is
     * refused naming a question that is no longer in any list. Treated as "when it is next due"
     * instead, which is what the column now actually shows.
     */
    const stored = r.register_display_field_key;
    const displayFieldKey = stored && choices.some((c) => c.key === stored) ? stored : null;
    return { id: r.id, key: r.key, name: r.name, show: r.show_on_register, displayFieldKey, choices };
  });
}

/**
 * The text each cell shows, keyed by EVIDENCE id, for every column pointed at a question.
 *
 * Reads the latest evidence behind each cell, which the register row already knows
 * (`last_evidence_id`), so no extra per person query. Only columns that are both shown AND
 * pointed at a question cost anything: the default due date column reads nothing.
 */
export async function getRegisterColumnText(
  columns: RegisterCheckColumn[],
  refs: Array<{ evidenceId: string; definitionId: string }>,
): Promise<Record<string, string>> {
  const pointed = columns.filter((c) => c.show && c.displayFieldKey);
  if (pointed.length === 0 || refs.length === 0) return {};

  const columnById = new Map(pointed.map((c) => [c.id, c]));
  const wanted = refs.filter((r) => columnById.has(r.definitionId));
  if (wanted.length === 0) return {};

  const definitionByEvidence = new Map(wanted.map((r) => [r.evidenceId, r.definitionId]));
  const ids = [...new Set(wanted.map((r) => r.evidenceId))];

  const supabase = await createClient();
  type EvidenceRow = { id: string; answers: Record<string, unknown> | null };

  /*
   * ANSWERS ONLY. Each evidence row also carries schema_snapshot, the entire frozen form, several
   * KB apiece; pulling those for six columns across a thousand records would move hundreds of
   * megabytes to look up one label. The wording comes from the column's own choices instead.
   *
   * CHUNK 100, not 200. `id=in.(...)` with 200 uuids is a query string of roughly 7.5 KB, which is
   * within a few hundred bytes of the default 8 KB request header buffer in front of PostgREST. A
   * 414 there would now be invisible, because a failed page is skipped rather than thrown.
   *
   * Six at a time rather than all at once: a thousand person register is sixty chunks, and firing
   * sixty simultaneous requests out of one page render is a cliff that only appears on the biggest
   * customer, which is exactly where it must not.
   */
  const CHUNK = 100;
  const CONCURRENCY = 6;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

  const answersById = new Map<string, Record<string, unknown> | null>();
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const pages = await Promise.all(
      chunks
        .slice(i, i + CONCURRENCY)
        .map((chunk) => supabase.from("evidence").select("id, answers").in("id", chunk)),
    );
    for (const page of pages) {
      // A failed page is left OUT of the map, never written as an empty answer: cellText then falls
      // back to the due date for those cells rather than painting them as "nothing recorded".
      // Logged, because a silently degraded column reads to a customer as "the feature is broken".
      if (page.error) {
        console.error("[register] column answers page failed:", page.error.message);
        continue;
      }
      for (const row of (page.data as EvidenceRow[] | null) ?? []) {
        answersById.set(row.id, row.answers);
      }
    }
  }

  const out: Record<string, string> = {};
  for (const [evidenceId, answers] of answersById) {
    const column = columnById.get(definitionByEvidence.get(evidenceId) as string);
    const fieldKey = column?.displayFieldKey;
    if (!fieldKey) continue;
    const field = column.choices.find((c) => c.key === fieldKey);
    out[evidenceId] = columnAnswerText(field, answers?.[fieldKey], formatDisplayDate);
  }
  return out;
}
