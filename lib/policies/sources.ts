import "server-only";
import { createHash } from "node:crypto";
import { SOURCE_TEXT_LIMIT, htmlToText, normaliseForCompare } from "./extract";

/**
 * Fetch one official source and return the text the policy AI reads, with a fingerprint the
 * 28 day re-check compares. Never throws: a failure comes back as a sentence the Founder
 * library page shows against the source, so a broken link is seen rather than trusted.
 */
/** Below this, a page is treated as unreadable (and a change on it can never be approved). */
export const MIN_PAGE_CHARS = 400;
export const MIN_LEGISLATION_CHARS = 120;

export async function fetchSourceText(
  url: string,
): Promise<{ ok: true; text: string; hash: string } | { ok: false; error: string }> {
  /* One retry for a slow or busy site (legislation.gov.uk timed out on three regulations in one
     run, 2026-10-06): a timeout or a server error is often gone a moment later. A 404 is not. */
  const once = () =>
    fetch(url, {
      headers: {
        "user-agent": "BeCareCompliant-PolicyLibrary/1.0 (+https://becarecompliant.com)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  let res: Response;
  try {
    res = await once();
    if (res.status >= 500) res = await once();
  } catch {
    try {
      res = await once();
    } catch (e) {
      return { ok: false, error: `Could not reach the page: ${(e as Error).message}` };
    }
  }
  if (!res.ok) return { ok: false, error: `The page answered ${res.status}.` };
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("pdf")) return { ok: false, error: "This link is a PDF. Link the web page instead." };
  const text = htmlToText(await res.text()).slice(0, SOURCE_TEXT_LIMIT);
  /* A single regulation can genuinely be two lines; any other page that short is a menu or a
     landing page with nothing an AI could write a policy from. */
  const min = /(^|\.)legislation\.gov\.uk$/i.test(new URL(url).hostname) ? MIN_LEGISLATION_CHARS : MIN_PAGE_CHARS;
  if (text.length < min) return { ok: false, error: "The page had almost no readable text." };
  const hash = createHash("sha256").update(normaliseForCompare(text)).digest("hex");
  return { ok: true, text, hash };
}
