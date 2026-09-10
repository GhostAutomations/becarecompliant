"use server";

/**
 * Be Care Compliant — pushing a library form to the companies that hold it.
 *
 * Founder only. The screen shows every company holding the form and what a push would do
 * to each; this carries out the ones the founder ticked, one at a time, and reports what
 * happened to each rather than a single "done".
 *
 * TWO GUARDS, BOTH DELIBERATE:
 *
 *  1. The state is worked out again HERE from the database, not trusted from the form
 *     post. A browser can send any form id; only a form the server itself judges pushable
 *     is pushed.
 *  2. The library schema recorded against the form when the founder read the list is passed
 *     back to push_library_form, which refuses if it has changed since. So a company
 *     editing their copy while the list sits open fails that one row instead of losing
 *     their work.
 *
 * A push publishes a NEW VERSION and never edits one in place: Evidence pins the exact
 * version it was filled in on, and an inspector opening last March's record must see the
 * questions that were actually asked.
 */

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { isFormSchema } from "@/lib/form-schema";
import { isPushable } from "./library-sync";
import { libraryPushView } from "./library-push";
import type { ActionState } from "@/lib/forms";

export async function pushLibraryForm(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();

  const templateKey = String(formData.get("template_key") ?? "").trim();
  const chosen = new Set(formData.getAll("form_ids").map((v) => String(v)));
  if (!templateKey) return { error: "Missing form." };
  if (chosen.size === 0) return { error: "Choose at least one company to send this to." };

  const view = await libraryPushView(templateKey);
  if (!view) return { error: "That library form could not be read." };

  const supabase = await createClient();
  const { data: template } = await supabase
    .from("form_templates")
    .select("name, version, schema")
    .eq("key", templateKey)
    .maybeSingle<{ name: string; version: number; schema: unknown }>();
  if (!template || !isFormSchema(template.schema)) {
    return { error: "That library form could not be read." };
  }
  const sent: string[] = [];
  const refused: string[] = [];

  for (const company of view.companies) {
    if (!chosen.has(company.formId)) continue;
    /* Judged here, from the database, whatever the browser sent. */
    if (!isPushable(company.state)) {
      refused.push(`${company.companyName} (${company.state.replace(/_/g, " ")})`);
      continue;
    }

    const { data: version, error } = await supabase.rpc("push_library_form", {
      p_form_id: company.formId,
      p_expect_library_schema: company.expectLibrarySchema,
      p_schema: template.schema,
      p_name: template.name,
      p_library_version: template.version,
    });

    if (error) {
      refused.push(`${company.companyName} (${error.message})`);
      continue;
    }

    sent.push(company.companyName);
    await writeAudit({
      companyId: company.companyId,
      actorId: user.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: "form.library_pushed",
      entityType: "form",
      entityId: company.formId,
      summary: `${template.name} updated from the library as version ${version as number}`,
      metadata: {
        template_key: templateKey,
        library_version: template.version,
        new_version: version,
        evidence_on_previous_version: company.evidenceCount,
      },
    });
    revalidatePath(`/settings/forms/${company.formId}`);
  }

  revalidatePath("/founder/forms");
  revalidatePath("/settings/forms");

  if (sent.length === 0) {
    return { error: `Nothing was sent. ${refused.join("; ")}` };
  }
  const ok = `Sent to ${sent.length === 1 ? sent[0] : `${sent.length} companies`}.`;
  return { ok: refused.length > 0 ? `${ok} Not sent to ${refused.join("; ")}.` : ok };
}
