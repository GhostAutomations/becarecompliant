/**
 * Be Care Compliant — folder and file names in the company's cloud drive (0437). Pure and
 * importless so node --test can load it.
 *
 * Phil, 2026-10-08: a person's or service user's folder is "Name (Branch)", renamed when either
 * changes; leavers and discharged service users keep their folder. Files are dated first so a
 * folder sorts by date.
 */

export type FolderKey =
  | "root"
  | `section:${SectionKey}`
  | `person:${string}`
  | `service_user:${string}`;

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
 * "Jane Smith (Cardiff)", or just "Jane Smith" with no branch. Two records with the same name in
 * the same branch must never share a folder (their files would land on top of each other), so
 * the second is "Jane Smith 2 (Cardiff)", the third "Jane Smith 3 (Cardiff)": `n` is the record's
 * place among the same named ones, oldest first.
 */
export function recordFolderName(fullName: string, branchName: string | null | undefined, n = 1): string {
  const name = safeDriveName(fullName, "Unnamed").slice(0, 90).trim();
  const numbered = n > 1 ? `${name} ${n}` : name;
  const branch = branchName ? safeDriveName(branchName, "").slice(0, 60).trim() : "";
  return safeDriveName(branch ? `${numbered} (${branch})` : numbered, "Unnamed");
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

/** The folder a key belongs inside. */
export function parentKey(key: FolderKey): FolderKey | null {
  if (key === "root") return null;
  if (key.startsWith("section:")) return "root";
  if (key.startsWith("person:")) return "section:people";
  if (key.startsWith("service_user:")) return "section:service_users";
  return "root";
}

export function isFolderKey(v: string): v is FolderKey {
  return (
    v === "root" ||
    (v.startsWith("section:") && (SECTION_KEYS as string[]).includes(v.slice(8))) ||
    /^person:[0-9a-f-]{36}$/i.test(v) ||
    /^service_user:[0-9a-f-]{36}$/i.test(v)
  );
}
