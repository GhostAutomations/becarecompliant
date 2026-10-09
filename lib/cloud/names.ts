/**
 * Be Care Compliant — folder and file names in the company's cloud drive (0437). Pure and
 * importless so node --test can load it.
 *
 * Phil, 2026-10-08: a person's or service user's folder is named after them, renamed when the
 * name changes; leavers and discharged service users keep their folder. Files are dated so a
 * folder sorts by date.
 *
 * Phil, 2026-10-09 (by popup): records sit in a folder for their branch, People > Llanelli >
 * Jane Smith, so the folder name no longer carries the branch; a transfer moves the folder.
 */

export type RecordKey = `person:${string}` | `service_user:${string}`;

/** "branch:people:<branchId>": a branch's folder inside People or Service Users (0441). */
export type BranchKey = `branch:${"people" | "service_users"}:${string}`;

/**
 * "person:<id>/holiday": a category folder inside a record's folder (Phil, 2026-10-09: "a holiday
 * folder, a spot check folder, a supervision folder ... a document folder").
 */
export type FolderKey = "root" | `section:${SectionKey}` | BranchKey | RecordKey | `${RecordKey}/${string}`;

export type SectionKey = "people" | "service_users" | "complaints" | "incidents" | "policies" | "briefings";

export const ROOT_FOLDER_NAME = "Be Care Compliant";

export const SECTION_NAMES: Record<SectionKey, string> = {
  people: "People",
  service_users: "Service Users",
  complaints: "Complaints",
  incidents: "Incidents",
  policies: "Policies",
  briefings: "Briefings",
};

export const SECTION_KEYS = Object.keys(SECTION_NAMES) as SectionKey[];

/**
 * A name OneDrive and SharePoint will accept: none of " * : < > ? / \ |, no leading or trailing
 * spaces or dots, no "~$" start, not empty, and short enough to leave room for the path.
 */
export function safeDriveName(raw: string, fallback = "Untitled"): string {
  let s = String(raw ?? "")
    .replace(/["*:<>?/\\|]+/g, " ")
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.~$\s]+/, "")
    .replace(/[.\s]+$/, "");
  if (s.length > 120) s = s.slice(0, 120).trim();
  return s || fallback;
}

/**
 * "Jane Smith". The folder sits inside its branch's folder, so the branch is not in the name
 * (Phil, 2026-10-09). Two records with the same name in the same branch must never share a folder
 * (their files would land on top of each other), so the second is "Jane Smith 2", the third
 * "Jane Smith 3": `n` is the record's place among the same named ones in that branch, oldest first.
 */
export function recordFolderName(fullName: string, n = 1): string {
  const name = safeDriveName(fullName, "Unnamed").slice(0, 90).trim();
  return safeDriveName(n > 1 ? `${name} ${n}` : name, "Unnamed");
}

/** A branch's folder name: the branch's own name. */
export function branchFolderName(branchName: string | null | undefined): string {
  return safeDriveName(String(branchName ?? ""), "Branch").slice(0, 100).trim() || "Branch";
}

/** Keep the extension of the original file, or add one. */
function withExtension(base: string, ext: string): string {
  const clean = ext.replace(/^\./, "").toLowerCase();
  return clean ? `${base}.${clean}` : base;
}

export function fileExtensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(String(name ?? "").trim());
  return m ? m[1].toLowerCase() : "";
}

/** The longest a file name may be before its extension. Room is left for the folders above it. */
const NAME_MAX = 120;

/** Shorten the title so the fixed parts (the date, a version, a "(2)") always survive. */
function fitTitle(title: string, fixedLength: number): string {
  const room = Math.max(10, NAME_MAX - fixedLength);
  const t = safeDriveName(title);
  return t.length > room ? t.slice(0, room).trim() : t;
}

/** "2026-10-08 Supervision 1 (v3).pdf" */
export function datedFileName(dateIso: string, title: string, opts: { version?: number | null; ext?: string; n?: number } = {}): string {
  const day = /^\d{4}-\d{2}-\d{2}/.test(dateIso) ? dateIso.slice(0, 10) : "";
  const v = opts.version ? ` (v${opts.version})` : "";
  const clash = opts.n && opts.n > 1 ? ` (${opts.n})` : "";
  const prefix = day ? `${day} ` : "";
  const t = fitTitle(title, prefix.length + v.length + clash.length);
  return withExtension(safeDriveName(`${prefix}${t}${v}${clash}`), opts.ext ?? "pdf");
}

/**
 * Initials for a record's files: "Gwyneth Ashby" -> "GA", "Mary-Jane O'Brien" -> "MJO". The first
 * letter of each part of the name, at most four, so a file says whose it is without the full name.
 */
export function initialsOf(fullName: string): string {
  const parts = String(fullName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[\s-]+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);
  return parts.map((w) => w[0].toUpperCase()).join("").slice(0, 4) || "XX";
}

/**
 * A file in a person's or service user's folder (Phil, 2026-10-09): initials, the SSID for a
 * service user, what it is, then the date. "GA 12345 Spot Check 2026-10-09.pdf" for a service
 * user, "JS Spot Check 2026-10-09.pdf" for a member of staff. A second one of the same thing on
 * the same day gets " (2)", a third " (3)", and so on, so nothing overwrites another.
 */
export function recordFileName(opts: {
  initials: string;
  ssid?: string | null;
  title: string;
  dateIso?: string | null;
  n?: number;
  ext?: string;
}): string {
  const day = opts.dateIso && /^\d{4}-\d{2}-\d{2}/.test(opts.dateIso) ? opts.dateIso.slice(0, 10) : "";
  const ssid = safeDriveName(String(opts.ssid ?? ""), "").slice(0, 20).trim();
  const clash = opts.n && opts.n > 1 ? ` (${opts.n})` : "";
  const before = [opts.initials, ssid].filter((x) => String(x ?? "").trim() !== "").join(" ");
  const after = day ? ` ${day}` : "";
  // The title gives way first, so the initials, SSID, date and "(2)" are never cut off.
  const title = fitTitle(opts.title, before.length + 1 + after.length + clash.length);
  return withExtension(safeDriveName(`${before} ${title}${after}${clash}`), opts.ext ?? "pdf");
}

/* ---------------------------------------------------------------------------------------------
 * CATEGORY FOLDERS inside each record's folder (Phil, 2026-10-09, by popup): one per check, named
 * like the check, plus these fixed ones; anything left over goes in a folder named after its form.
 * Every one is made when the record's folder is made.
 * ------------------------------------------------------------------------------------------- */

export const CATEGORY_NAMES: Record<string, string> = {
  holiday: "Holiday",
  absence: "Absence",
  training: "Training",
  documents: "Documents",
  dbs: "DBS",
  rtw: "Right to Work",
  probation: "Probation",
  "care-plan": "Care Plan",
};

/** The fixed folders every person and every service user gets. */
export const PERSON_FIXED_CATEGORIES = ["holiday", "absence", "training", "documents", "dbs", "rtw", "probation"];
export const SERVICE_USER_FIXED_CATEGORIES = ["care-plan", "documents"];

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RECORD_RE = new RegExp(`^(person|service_user):${UUID_RE}$`, "i");
const CATEGORY_RE = new RegExp(
  `^((?:person|service_user):${UUID_RE})/(holiday|absence|training|documents|dbs|rtw|probation|care-plan|check-${UUID_RE}|form-${UUID_RE})$`,
  "i",
);

export function isRecordKey(v: string): v is RecordKey {
  return RECORD_RE.test(v);
}

const BRANCH_RE = new RegExp(`^branch:(people|service_users):${UUID_RE}$`, "i");

export function isBranchKey(v: string): v is BranchKey {
  return BRANCH_RE.test(v);
}

/** The branch folder a record belongs in: People's or Service Users' folder for that branch. */
export function branchKey(record: RecordKey, branchId: string): BranchKey {
  return `branch:${record.startsWith("person:") ? "people" : "service_users"}:${branchId}`;
}

/** The section a record or branch folder lives under. */
export function sectionKeyOf(key: RecordKey | BranchKey): FolderKey {
  return key.startsWith("person:") || key.startsWith("branch:people:") ? "section:people" : "section:service_users";
}

export function categoryKey(record: RecordKey, slug: string): FolderKey {
  return `${record}/${slug}`;
}

/** The record and category of a category key, or null for any other key. */
export function splitCategoryKey(key: string): { record: RecordKey; slug: string } | null {
  const m = CATEGORY_RE.exec(key);
  return m ? { record: m[1] as RecordKey, slug: m[2].toLowerCase() } : null;
}

/**
 * Which category a form's file belongs in when no check uses that form, read from the form's key:
 * holiday forms in Holiday, absence and Return to Work forms in Absence, and so on. Null means
 * "a folder of its own, named after the form".
 */
export function categoryForFormKey(formKey: string | null | undefined, recordType: string): string | null {
  const k = String(formKey ?? "").toLowerCase();
  if (!k) return null;
  if (recordType === "person") {
    if (k.includes("holiday")) return "holiday";
    if (k.includes("right_to_work")) return "rtw";
    if (k.includes("absence") || k.includes("return_to_work")) return "absence";
    if (k.includes("dbs")) return "dbs";
    if (k.includes("probation")) return "probation";
    if (k.includes("training")) return "training";
  }
  if (recordType === "service_user" && k.includes("care_plan")) return "care-plan";
  return null;
}

/**
 * The folder a key belongs inside. A record's folder belongs in its BRANCH's folder, which this
 * cannot know (it needs the record's branch from the database), so for a record this gives the
 * record's section; ensureFolder asks the database for the branch.
 */
export function parentKey(key: FolderKey): FolderKey | null {
  if (key === "root") return null;
  const cat = splitCategoryKey(key);
  if (cat) return cat.record;
  if (key.startsWith("section:")) return "root";
  if (isBranchKey(key)) return sectionKeyOf(key);
  if (key.startsWith("person:")) return "section:people";
  if (key.startsWith("service_user:")) return "section:service_users";
  return "root";
}

export function isFolderKey(v: string): v is FolderKey {
  return (
    v === "root" ||
    (v.startsWith("section:") && (SECTION_KEYS as string[]).includes(v.slice(8))) ||
    /^person:[0-9a-f-]{36}$/i.test(v) ||
    /^service_user:[0-9a-f-]{36}$/i.test(v) ||
    isBranchKey(v) ||
    splitCategoryKey(v) !== null
  );
}
