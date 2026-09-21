import "server-only";

/**
 * Be Care Compliant — recording what a new record has ALREADY done.
 *
 * Phil, 2026-09-21: "in people we have add a person, this assumes that it is always a new
 * person ... when the add person button is pressed, it adds them to the matrix with all the data
 * just entered."
 *
 * THE SAME PATH THE BULK IMPORT USES. Every date goes through seed_migrated_completion, so a
 * carer typed in one at a time and a carer loaded from a spreadsheet end up identical in the
 * database: the completions are stored as history with the slot they occupied, the newest one
 * moves the check on, and none of them carries evidence, because none of them happened in here.
 * The register, the on time report and the inspection pack all read them the same way.
 *
 * WHAT IS DIFFERENT FROM THE IMPORT, and deliberately so: the NEXT DUE DATE IS CALCULATED here
 * rather than copied. An import is reproducing a history that a spreadsheet already describes,
 * including what it says comes next. A person typed into Add a person has no spreadsheet behind
 * them: what comes next is whatever this company's own cycle says comes next, counted from the
 * last time it was done.
 */

import { createClient } from "@/lib/supabase/server";
import { parseCivilDate } from "@/lib/recurrence";
import { nextDueAfterCompletion } from "@/lib/people/logic";
import type { CheckDefinition } from "@/lib/people/types";
import type { HistoryEntry } from "@/lib/people/history-boxes";

/**
 * Seed one record's history. Returns a sentence per check that could not be written.
 *
 * EVERY RESULT IS READ. On 2026-09-16 an ambiguous function signature made every seeding call
 * fail while an import reported twelve records created (lib/import/commit.ts says the same
 * thing). A write nobody looks at is a write that can stop happening without anybody being told,
 * and the whole point of this box is the history.
 */
export async function seedPersonHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personId: string,
  entries: readonly HistoryEntry[],
  defs: readonly CheckDefinition[],
  supIntervalDays: number | null,
): Promise<string[]> {
  const defById = new Map(defs.map((d) => [d.id, d]));
  const failures: string[] = [];

  for (const entry of entries) {
    const def = defById.get(entry.definitionId);
    if (!def || entry.dates.length === 0) continue;

    const newest = entry.dates[0];
    const { nextDue } = nextDueAfterCompletion(def, {}, supIntervalDays, parseCivilDate(newest));

    for (let i = 0; i < entry.dates.length; i++) {
      const { error } = await supabase.rpc("seed_migrated_completion", {
        p_record_type: "person",
        p_record_id: personId,
        p_definition_id: def.id,
        p_completed_on: entry.dates[i],
        /* NO DUE DATE against a historical completion. We were not told when it was due — only
           when it happened — and inventing one would tell the on time report a supervision done
           in March was late or early against a deadline nobody ever set. */
        p_due_on: null,
        p_slot: entry.slots[i] ?? null,
        p_next_due: i === 0 ? nextDue : null,
        p_is_latest: i === 0,
      });
      if (error) {
        // One sentence per check, not per date: five identical messages say no more than one.
        failures.push(`${entry.name}: ${error.message}`);
        break;
      }
    }
  }
  return failures;
}
