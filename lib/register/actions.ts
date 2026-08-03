"use server";

/**
 * Be Care Compliant — save the register's custom column order, visibility and contents (Item 6).
 * Company Admin (or Founder via manage-as) only. Persists register_position from the given order,
 * show_on_register per column, and the question each column is pointed at.
 *
 * Nothing the browser sends is trusted: the columns are re-read server side, so the cap, the
 * ownership of every id and the legality of every question key are decided here, not in the panel.
 */

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/forms";
import { listRegisterCheckColumns } from "./data";
import { isDisplayChoice, MAX_REGISTER_COLUMNS, shownColumnCount } from "./custom-columns";

type ColumnInput = { id: string; show: boolean; displayFieldKey?: string | null };

export async function saveRegisterColumns(input: {
  population: "people" | "service_users";
  columns: ColumnInput[];
}): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (profile.role !== "company_admin" && profile.role !== "platform_admin") {
    return { error: "Only an Admin can change the register columns." };
  }
  const population = input.population;
  if (population !== "people" && population !== "service_users") {
    return { error: "Unknown register." };
  }
  const columns = (Array.isArray(input.columns) ? input.columns : []).filter((c) => c?.id);

  // The authority on what exists, what it may show, and whose it is.
  const known = await listRegisterCheckColumns(profile.company_id, population);
  const knownById = new Map(known.map((c) => [c.id, c]));

  /*
   * OWNERSHIP FIRST, then the cap. A panel left open while somebody else deactivated a check posts
   * an id that no longer exists; counted before it is checked, that phantom inflates the total and
   * the Admin is told to hide a column when the real answer is that their list is out of date.
   */
  for (const c of columns) {
    const column = knownById.get(c.id);
    if (!column) {
      return { error: "One of those columns is no longer on this register. Reload and try again." };
    }
    const key = c.displayFieldKey ?? null;
    if (!isDisplayChoice(column.choices, key)) {
      return { error: `"${column.name}" cannot show that question. Choose another.` };
    }
  }

  /*
   * The cap counts what the REGISTER WILL SHOW, not what this panel happened to send. Counting the
   * payload alone lets six become seven: a panel opened before two new check types existed sends
   * only the columns it knew about, and the ones it omitted stay shown in the database. A crafted
   * call could walk it up one column at a time the same way.
   */
  const willShow = new Map(known.map((c) => [c.id, c.show]));
  for (const c of columns) willShow.set(c.id, Boolean(c.show));
  const shown = shownColumnCount([...willShow.values()].map((show) => ({ show })));
  if (shown > MAX_REGISTER_COLUMNS) {
    return {
      error: `That would show ${shown} extra columns and the limit is ${MAX_REGISTER_COLUMNS}. Hide one before adding another.`,
    };
  }

  const supabase = await createClient();
  /*
   * One update per column, so a failure part way leaves SOME columns moved. Rather than stopping
   * and reporting an error that implies nothing was saved, every column is attempted and the
   * outcome is reported as it actually is. Re-saving fixes a partial write.
   */
  const failed: string[] = [];
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i];
    const { error } = await supabase
      .from("check_definitions")
      .update({
        register_position: i,
        show_on_register: Boolean(c.show),
        register_display_field_key: c.displayFieldKey ?? null,
      })
      .eq("id", c.id)
      .eq("company_id", profile.company_id)
      .eq("population", population);
    if (error) {
      // The reason goes to the log, the NAME goes to the screen. Without this a customer reporting
      // "these columns did not save" leaves nothing to work from.
      console.error("[register] column save failed:", error.message);
      failed.push(knownById.get(c.id)?.name ?? "A column");
    }
  }
  if (columns.length > 0 && failed.length === columns.length) {
    return { error: "Nothing was saved. Please try again." };
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.register_columns_updated",
    entityType: "company",
    entityId: profile.company_id,
    summary: `Updated ${population === "people" ? "People" : "Service User"} register columns`,
    metadata: { population, count: columns.length, shown, failed: failed.length },
  });

  revalidatePath(population === "people" ? "/people" : "/service-users");
  if (failed.length > 0) {
    // Never opens with "Saved" in a red box. It names what did not land and what to do about it.
    return { error: `These columns did not save: ${failed.join(", ")}. Please save again.` };
  }
  return { ok: "Saved." };
}
