/**
 * Be Care Compliant — a Check completed on paper, uploaded as its Evidence. Pure and IMPORTLESS,
 * so node --test can load it.
 *
 * WHY IT EXISTS (Phil, 2026-09-23, DEF-056): "lets create an upload button where evidence can be
 * uploaded, this will be handy if anything ever has to be completed on paper and can be uploaded
 * as evidence", and "it should only be active for admin". Agreed by popup the same day:
 *
 *  - It lives on the Complete page, as the other way of completing the same Check.
 *  - The Check takes the DATE IT WAS DONE ON PAPER, which may be in the past. The newest
 *    completion moves the due date on; an older one goes into the history and moves nothing.
 *    That is also how an existing record gets its back history (item 4 on the Thistle list).
 *  - A FILE IS REQUIRED. A completion nobody can open is not evidence.
 *  - People and Service Users both.
 *
 * THE DATE TRAVELS IN THE ANSWERS, under a key no Form can produce (a leading double underscore:
 * the form builder only makes keys from letters, digits and single underscores). Every screen
 * that dates a completion already reads the answers through completionDate(), which now looks
 * for this key first, so a paper supervision lands in the right supervision slot on the matrix
 * without any of those screens knowing paper exists.
 */

/** Where a paper completion's date is kept in its Evidence answers. */
export const PAPER_DATE_KEY = "__completed_on";

/** Pages per upload. Ten is a long supervision photographed a page at a time. */
export const PAPER_MAX_FILES = 10;

/** Per file. A phone photo is 3 to 6 MB; a scanned multi page PDF can be more. */
export const PAPER_MAX_MB = 20;
export const PAPER_MAX_BYTES = PAPER_MAX_MB * 1024 * 1024;

/** What the picker offers. Pictures are drawn on the Evidence and its PDF; a PDF is attached. */
export const PAPER_ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif";

const EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "heic", "heif"]);

/** The field key each uploaded page is filed under: paper_copy_1, paper_copy_2 and so on. */
export function paperFieldKey(n: number): string {
  return `paper_copy_${n}`;
}

/** The object path prefix every page of one paper upload must sit under. */
export function paperPathPrefix(companyId: string, evidenceId: string): string {
  return `${companyId}/${evidenceId}/files/paper_copy_`;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function realDate(iso: string): boolean {
  const m = ISO.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Why a paper completion date will not do, or null when it will. */
export function paperDateProblem(iso: string | null | undefined, todayIso: string): string | null {
  const v = String(iso ?? "").trim();
  if (!v) return "Enter the date it was completed on paper.";
  if (!realDate(v)) return "Enter a real date.";
  if (v > todayIso) return "The date it was completed cannot be in the future.";
  if (v < "2000-01-01") return "Enter a date from 2000 onwards.";
  return null;
}

/** Why one chosen file will not do, or null when it will. */
export function paperFileProblem(file: { name: string; size: number }): string | null {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!EXTENSIONS.has(ext)) return `${file.name} is not a PDF or a photo. Upload a PDF, JPG, PNG or HEIC.`;
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > PAPER_MAX_BYTES) return `${file.name} is over ${PAPER_MAX_MB} MB.`;
  return null;
}

/** Why the chosen set of files will not do, or null when it will. */
export function paperFilesProblem(files: ReadonlyArray<{ name: string; size: number }>): string | null {
  if (files.length === 0) return "Add the scanned copy or a photo of each page.";
  if (files.length > PAPER_MAX_FILES) return `Upload up to ${PAPER_MAX_FILES} files at a time.`;
  for (const f of files) {
    const problem = paperFileProblem(f);
    if (problem) return problem;
  }
  return null;
}

/** The paper date on a piece of Evidence, or null when it was filled in on screen. */
export function paperCompletedOn(answers: Record<string, unknown> | null | undefined): string | null {
  const v = answers?.[PAPER_DATE_KEY];
  return typeof v === "string" && ISO.test(v) ? v : null;
}

/**
 * Who sees "Done on paper? Upload it instead", and on which Checks.
 *
 * ADMINS ONLY (Phil, 2026-09-23). The database refuses anybody else as well
 * (submit_paper_evidence), so hiding it is courtesy, not the lock.
 *
 * NOT the Setup Visit: its answers ARE the care package, the funding and the invoicing, and a
 * scan carries none of that into the app. NOT a Check that dates itself from an expiry answer,
 * because a scan cannot be read for one.
 */
export function paperOffered(opts: {
  role: string;
  supportMode: boolean;
  population: "people" | "service_users";
  checkKey: string;
  anchor: string | null;
}): boolean {
  if (opts.supportMode) return false;
  if (opts.role !== "company_admin") return false;
  if (opts.population === "service_users" && opts.checkKey === "setup") return false;
  if (opts.anchor === "expiry") return false;
  return true;
}
