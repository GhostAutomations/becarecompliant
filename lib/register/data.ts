import "server-only";

/**
 * Be Care Compliant — register custom columns data (Item 4). Lists a company's
 * active, non-curated check definitions for a population, in the Admin-set order
 * (register_position, nulls last, then sort_order then name). RLS-scoped via the
 * user client. Returns every such check (including hidden ones) so the Columns
 * panel can re-show them; the matrix filters to `show`.
 */

import { createClient } from "@/lib/supabase/server";
import { isCuratedCheckKey, type RegisterCheckColumn } from "./custom-columns";

export async function listRegisterCheckColumns(
  companyId: string,
  population: "people" | "service_users",
): Promise<RegisterCheckColumn[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("check_definitions")
    .select("id, key, name, show_on_register, register_position, sort_order")
    .eq("company_id", companyId)
    .eq("population", population)
    .eq("active", true);

  const rows =
    (data as Array<{
      id: string;
      key: string;
      name: string;
      show_on_register: boolean;
      register_position: number | null;
      sort_order: number;
    }> | null) ?? [];

  return rows
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
    })
    .map((r) => ({ id: r.id, key: r.key, name: r.name, show: r.show_on_register }));
}
