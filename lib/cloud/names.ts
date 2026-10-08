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
