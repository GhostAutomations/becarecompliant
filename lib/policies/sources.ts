import "server-only";
import { createHash } from "node:crypto";
import { SOURCE_TEXT_LIMIT, htmlToText, normaliseForCompare } from "./extract";

/**
 * Fetch one official source and return the text the policy AI reads, with a fingerprint the
 * 28 day re-check compares. Never throws: a failure comes back as a sentence the Founder
 * library page shows against the source, so a broken link is seen rather than trusted.
 */
export async function fetchSourceText(
  url: string,
): Promise<{ ok: true; text: string; hash: string } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "user-agent": "BeCareCompliant-PolicyLibrary/1.0 (+https://becarecompliant.com)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: `Could not reach the page: ${(e as Error).message}` };
  }
  if (!res.ok) return { ok: false, error: `The page answered ${res.status}.` };
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("pdf")) return { ok: false, error: "This link is a PDF. Link the web page instead." };
  const text = htmlToText(await res.text()).slice(0, SOURCE_TEXT_LIMIT);
  if (text.length < 200) return { ok: false, error: "The page had almost no readable text." };
  const hash = createHash("sha256").update(normaliseForCompare(text)).digest("hex");
  return { ok: true, text, hash };
}
