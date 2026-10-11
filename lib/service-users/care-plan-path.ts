/**
 * Be Care Compliant — where a Service User's care plan document is stored, and what an earlier
 * version is called in a subject access export (audit F13, 10 Oct 2026). Pure and importless so
 * node --test can load it.
 *
 * Each upload gets its OWN folder: {company}/care-plans/{serviceUser}/{uploadId}/{file}. Before
 * this the path was the file name alone and the upload replaced whatever was there, so choosing
 * Replace with a file of the same name destroyed the previous plan, and anyone who could read the
 * record could overwrite it. Phil, 11 Oct 2026 (popup): keep every version. The database records
 * each one (service_user_care_plan_files, 0444). The upload id is a folder, not a prefix, so the
 * file keeps its own name and extension for the cloud drive copy and the export.
 */

/** The file's own name, made safe for a storage path. Never empty, never a dot segment. */
export function carePlanFileName(name: string): string {
  const s = String(name ?? "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 80);
  return s || "care-plan";
}

export function carePlanPath(companyId: string, serviceUserId: string, uploadId: string, fileName: string): string {
  return `${companyId}/care-plans/${serviceUserId}/${uploadId}/${carePlanFileName(fileName)}`;
}

/** Is this path inside that service user's own care plan folder? (The database checks it too.) */
export function inCarePlanFolder(path: string, companyId: string, serviceUserId: string): boolean {
  return String(path ?? "").startsWith(`${companyId}/care-plans/${serviceUserId}/`) && !/(^|\/)\.\.(\/|$)/.test(path);
}

/**
 * The name a version gets in a subject access export: the London date it was uploaded, whether it
 * is the current plan or an earlier one, then its own file name. "2026-10-11 current care_plan.pdf".
 */
export function carePlanExportName(input: { uploadedAt: string | null | undefined; fileName: string; current: boolean }): string {
  const t = input.uploadedAt ? new Date(input.uploadedAt) : null;
  const day =
    t && !Number.isNaN(t.getTime())
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(t)
      : "undated";
  return `${day} ${input.current ? "current" : "earlier"} ${carePlanFileName(input.fileName)}`;
}
