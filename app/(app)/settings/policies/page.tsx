import { redirect } from "next/navigation";

/** Policies moved out of Settings into their own department on 2026-10-06. Kept so a
 *  bookmark, an old email or the setup list still lands in the right place. */
export default function PoliciesSettingsMoved() {
  redirect("/policies");
}
