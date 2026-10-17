import "server-only";

/**
 * Be Care Compliant: a company's Settings, Rota options (0509), read as the caller (RLS: a member
 * sees their own company's row). No row means the defaults.
 */

import { createClient } from "@/lib/supabase/server";
import { rotaSettingsFromRow, type RotaSettings } from "@/lib/rota/settings-rules";

export async function getRotaSettings(companyId: string): Promise<RotaSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from("rota_settings").select("*").eq("company_id", companyId).maybeSingle();
  return rotaSettingsFromRow(data as Record<string, unknown> | null);
}
