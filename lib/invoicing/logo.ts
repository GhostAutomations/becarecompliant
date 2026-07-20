import "server-only";

/**
 * Company logo for branded invoices. Stored in the private evidence bucket under
 * {companyId}/branding/, and served as a base64 data URL so it embeds directly in
 * both the on-screen invoice and the @react-pdf PDF (no signed-URL expiry to
 * manage, and it works inside the serverless PDF renderer).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { EVIDENCE_BUCKET } from "@/lib/evidence/storage";

function ext(name: string): string {
  const m = name.toLowerCase().match(/\.(png|jpg|jpeg|webp)$/);
  return m ? m[1].replace("jpeg", "jpg") : "png";
}

export function logoPath(companyId: string, fileName: string): string {
  return `${companyId}/branding/logo.${ext(fileName)}`;
}

export async function uploadCompanyLogo(
  companyId: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = logoPath(companyId, file.name);
  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, bytes, { contentType: file.type || "image/png", upsert: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

/** Download the logo and return a data URL (or null if none / unreadable). */
export async function getCompanyLogoDataUrl(companyId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data: company } = await supabase
    .from("companies")
    .select("logo_path")
    .eq("id", companyId)
    .maybeSingle();
  const path = company?.logo_path as string | null | undefined;
  if (!path) return null;
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).download(path);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  const mime = path.endsWith(".png")
    ? "image/png"
    : path.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}
