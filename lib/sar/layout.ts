/**
 * Be Care Compliant — how a subject access export is laid out. Pure and IMPORTLESS, so node --test
 * can load it.
 *
 * WHAT IT IS (Phil, 2026-09-24, agreed by popup): when a Person or a Service User asks for the
 * data held about them, a Company Admin downloads ONE ZIP from Manage record on their record:
 *   * summary.pdf, a readable copy of everything,
 *   * a CSV for each section,
 *   * evidence.pdf, every completed form in full,
 *   * files/, every attached file in its original form.
 * A Person's export carries their record, checks, evidence, Updates, training, holiday, absence
 * and leaving. A Service User's carries their record, checks, evidence, Updates, care plan, care
 * schedule and outcomes. Complaints, incidents, invoices and the access log are NOT included.
 *
 * The company is the controller and answers the request; the product only gathers. README.txt
 * says so, and says the export must be read for other people's details before it is sent.
 */

export type SarKind = "person" | "service_user";

/** A name safe to use as a file name inside the ZIP, keeping its extension. */
export function safeFileName(name: string, fallback = "file"): string {
  const cleaned = String(name ?? "")
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .slice(0, 100);
  return cleaned || fallback;
}

/**
 * A path inside the ZIP that has not been used yet. Two files called photo.jpg in the same folder
 * become photo.jpg and photo_2.jpg, so neither overwrites the other.
 */
export function uniquePath(used: Set<string>, folder: string, name: string): string {
  const safe = safeFileName(name);
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";
  let candidate = `${folder}/${safe}`;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${folder}/${stem}_${n}${ext}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** "subject-access-jane-smith-2026-09-24.zip". */
export function zipFileName(recordName: string, dateIso: string): string {
  const who = String(recordName ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `subject-access-${who || "record"}-${dateIso}.zip`;
}

/** The sections a kind of record carries, in the order they are printed. */
export function sarSections(kind: SarKind): string[] {
  return kind === "person"
    ? ["Record", "Checks", "Updates", "Training", "Holiday", "Absence", "Absence count restarts", "Absence meetings", "Leaving", "Evidence"]
    : ["Record", "Checks", "Updates", "Care schedule", "Outcomes", "Outcome notes", "Outcome reviews", "Evidence"];
}

/** README.txt: what the ZIP holds and what the company must do before sending it. No dashes. */
export function readmeText(opts: {
  kind: SarKind;
  recordName: string;
  companyName: string;
  generatedAt: string;
  generatedBy: string;
  files: string[];
}): string {
  const who = opts.kind === "person" ? "Person" : "Service User";
  const lines = [
    `Subject access export for ${opts.recordName} (${who})`,
    `Company: ${opts.companyName}`,
    `Made: ${opts.generatedAt} by ${opts.generatedBy}, using Be Care Compliant.`,
    "",
    "WHAT IS IN THIS FILE",
    "summary.pdf       a readable copy of everything below.",
    "evidence.pdf      every completed form on the record, in full.",
    "*.csv             each section as a spreadsheet.",
    "files/            every attached file, as it was uploaded.",
    "",
    `Sections: ${sarSections(opts.kind).join(", ")}.`,
    "",
    "BEFORE YOU SEND IT",
    `${opts.companyName} is the controller of this data and is responsible for answering the request.`,
    "Read it first. Remove or redact anything that identifies another person, unless they have agreed",
    "or it is reasonable to include it, and anything else you are entitled to withhold. The ICO's guidance",
    "on subject access requests explains what may be withheld and the time limit for replying.",
    "",
    "This file holds personal and possibly special category data. Keep it secure and delete your copy",
    "once the request has been answered.",
    "",
    `FILES (${opts.files.length})`,
    ...opts.files,
    "",
  ];
  return lines.join("\r\n");
}
