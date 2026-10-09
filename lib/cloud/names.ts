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

/** "Jane Smith (Cardiff)", or just "Jane Smith" with no branch. */
export function recordFolderName(fullName: string, branchName: string | null | undefined): string {
  const name = safeDriveName(fullName, "Unnamed");
  const branch = branchName ? safeDriveName(branchName, "") : "";
  return branch ? `${name} (${branch})` : name;
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

/** "2026-10-08 Supervision 1 (v3).pdf" */
export function datedFileName(dateIso: string, title: string, opts: { version?: number | null; ext?: string } = {}): string {
  const day = /^\d{4}-\d{2}-\d{2}/.test(dateIso) ? dateIso.slice(0, 10) : "";
  const v = opts.version ? ` (v${opts.version})` : "";
  const base = safeDriveName(`${day ? `${day} ` : ""}${title}${v}`);
  return withExtension(base, opts.ext ?? "pdf");
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
  const ssid = String(opts.ssid ?? "").trim();
  const parts = [opts.initials, ssid, opts.title, day].filter((x) => String(x ?? "").trim() !== "");
  const clash = opts.n && opts.n > 1 ? ` (${opts.n})` : "";
  return withExtension(safeDriveName(`${parts.join(" ")}${clash}`), opts.ext ?? "pdf");
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
