import "server-only";
import { createHash } from "node:crypto";
import { SOURCE_TEXT_LIMIT, htmlToText, normaliseForCompare, printGuideListUrl, printGuidePageUrls, readableUrl } from "./extract";

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
  const target = readableUrl(url);
  const once = () =>
    fetch(target, {
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
  const html = await res.text();
  /* An HSE whole-guide print page is filled in by the browser from a list of section pages; read
     those sections here instead (see printGuideListUrl). Any section that fails stops the load,
     so a half guide is never stored as if it were the whole one. */
  const guideList = printGuideListUrl(html, target);
  let text: string;
  if (guideList) {
    const guide = await readPrintGuide(guideList, target);
    if (!guide.ok) return guide;
    text = guide.text.slice(0, SOURCE_TEXT_LIMIT);
  } else {
    text = htmlToText(html).slice(0, SOURCE_TEXT_LIMIT);
  }
  /* A single regulation can genuinely be two lines; any other page that short is a menu or a
     landing page with nothing an AI could write a policy from. */
  const min = /(^|\.)legislation\.gov\.uk$/i.test(new URL(url).hostname) ? MIN_LEGISLATION_CHARS : MIN_PAGE_CHARS;
  if (text.length < min) return { ok: false, error: "The page had almost no readable text." };
  const hash = createHash("sha256").update(normaliseForCompare(text)).digest("hex");
  return { ok: true, text, hash };
}


async function getText(url: string, accept: string): Promise<{ ok: true; body: string } | { ok: false; error: string }> {
  const go = () =>
    fetch(url, {
      headers: { "user-agent": "BeCareCompliant-PolicyLibrary/1.0 (+https://becarecompliant.com)", accept },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  let res: Response;
  try {
    res = await go();
    if (res.status >= 500) res = await go();
  } catch {
    try {
      res = await go();
    } catch (e) {
      return { ok: false, error: `Could not reach ${url}: ${(e as Error).message}` };
    }
  }
  if (!res.ok) return { ok: false, error: `${url} answered ${res.status}.` };
  return { ok: true, body: await res.text() };
}

/** Every section of an HSE print guide, in order, as one text. */
async function readPrintGuide(listUrl: string, pageUrl: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const list = await getText(listUrl, "application/json");
  if (!list.ok) return { ok: false, error: `The guide's section list could not be read. ${list.error}` };
  const pages = printGuidePageUrls(list.body, pageUrl);
  if (pages.length === 0) return { ok: false, error: "The guide's section list was empty." };
  const parts: string[] = [];
  for (const p of pages) {
    const one = await getText(p, "text/html,application/xhtml+xml");
    if (!one.ok) return { ok: false, error: `A section of the guide could not be read. ${one.error}` };
    parts.push(htmlToText(one.body));
  }
  return { ok: true, text: parts.join("\n\n") };
}
