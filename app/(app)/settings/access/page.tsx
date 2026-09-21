import { redirect } from "next/navigation";

/**
 * Settings, User access — folded into Settings, Users and access on 2026-09-21 (Phil: "i think we
 * should join those 2 settings together"). The address stays alive because it is in browser
 * histories, bookmarks and two revalidatePath calls in settings/actions.ts.
 */
export default function AccessSettingsPage() {
  redirect("/settings/users");
}
