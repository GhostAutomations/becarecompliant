/**
 * Be Care Compliant: turn an official web page into the plain text the policy AI reads.
 *
 * Pure and importless, so node --test can load it. The page furniture (menus, cookie banners,
 * footers, scripts) is removed first, because a cookie notice changing must not look like the
 * law changing: the 28 day re-check compares this text, not the raw page.
 */

const DROP = ["script", "style", "noscript", "svg", "nav", "header", "footer", "form", "iframe", "button", "template"];

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, ", ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/** The part of the page that holds the content, when the page says which part that is. */
function contentPart(html: string): string {
  const pick = (re: RegExp) => html.match(re)?.[0] ?? null;
  return (
    pick(/<main[\s\S]*?<\/main>/i) ??
    pick(/<article[\s\S]*?<\/article>/i) ??
    pick(/<body[\s\S]*?<\/body>/i) ??
    html
  );
}

/** legislation.gov.uk marks the text of the law itself; a short regulation is short. */
function legislationPart(html: string): string | null {
  return html.match(/<div[^>]+id="viewLegSnippet"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i)?.[0] ?? null;
}

export function htmlToText(html: string): string {
  /* The law itself, when the page marks it: never padded out with the page around it, however
     short (a regulation can be three lines, and three lines is right). */
  const leg = legislationPart(html);
  if (leg) {
    const t = textOf(leg);
    if (t.length > 0) return t;
  }
  const part = textOf(contentPart(html));
  /* Some sites keep the words outside <main> (or put an empty <main> round a menu): when the
     chosen part says almost nothing, read the whole body instead. */
  if (part.length >= 400) return part;
  const body = textOf(html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html);
  return body.length > part.length ? body : part;
}

function textOf(fragment: string): string {
  let s = fragment;
  for (const tag of DROP) {
    s = s.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  }
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  // A part that starts inside a comment keeps its tail ("variants -->" on HSE pages).
  s = s.replace(/^[^<]*?-->/, " ").replace(/>[^<]*?-->/g, "> ");
  // Cookie and consent banners are not content.
  s = s.replace(/<div[^>]+(cookie|consent|banner)[^>]*>[\s\S]*?<\/div>/gi, " ");
  s = s
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/blockquote)\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\s*h([1-6])[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l, i, all) => l.length > 0 || (i > 0 && all[i - 1].length > 0))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** What is compared every 28 days: the text with spacing flattened, so a reflowed page with
 *  the same words is not a change. */
export function normaliseForCompare(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Longest text kept per source. Legislation sections are short; guidance pages are cut here
 *  so one long page cannot crowd the others out of the AI's reading. */
export const SOURCE_TEXT_LIMIT = 40_000;

/**
 * The address to READ for a source. A GOV.UK guide is split into parts (Overview, Pay,
 * Eligibility, How to claim) and its first page is only the overview: Maternity pay and leave
 * read as 853 characters. Its print view holds every part on one page. The link people see and
 * open stays the guide itself.
 */
export function readableUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "www.gov.uk" && /^\/[a-z0-9-]+\/?$/.test(u.pathname)) {
      return `${u.origin}${u.pathname.replace(/\/$/, "")}/print`;
    }
  } catch {
    // Not a URL: leave it for the fetch to report.
  }
  return url;
}
