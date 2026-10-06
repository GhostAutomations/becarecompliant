/**
 * The wording of a Word document (.docx), for "Improve a policy with AI" (Phil, 2026-10-06:
 * "what if people have got documents? I've just tried to upload a docx and it won't let me").
 *
 * A .docx is a zip; its text is word/document.xml. Each <w:p> is a paragraph, its words are in
 * <w:t>, and a paragraph styled Heading N becomes a "#" heading so the AI sees the structure.
 * fflate is already a dependency. Pure: bytes in, text out. The old binary .doc is not a zip and
 * is refused by the caller with a sentence.
 */

import { unzipSync, strFromU8 } from "fflate";

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/** The document's text, or null when it is not a readable .docx. */
export function docxToText(bytes: Uint8Array): string | null {
  let xml: string;
  try {
    /* Only the document text, and only when it unpacks to a sensible size: a 3MB upload that
       claims to unpack to gigabytes is refused rather than filling the server's memory
       (review, 2026-10-07). */
    const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" && f.originalSize <= 25_000_000 });
    const doc = files["word/document.xml"];
    if (!doc) return null;
    xml = strFromU8(doc);
  } catch {
    return null;
  }
  const out: string[] = [];
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const p = m[0];
    const text = decode(
      p
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:br[^>]*\/>/g, "\n")
        .replace(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g, "\u0001$1\u0002")
        .replace(/[^\u0001\u0002]*?\u0001([\s\S]*?)\u0002/g, "$1")
        .replace(/<[^>]+>/g, ""),
    ).trim();
    if (!text) continue;
    const heading = p.match(/<w:pStyle w:val="(?:Heading|heading)(\d)"/);
    const list = /<w:numPr>/.test(p);
    out.push(heading ? `${"#".repeat(Math.min(Number(heading[1]), 3))} ${text}` : list ? `- ${text}` : text);
  }
  const text = out.join("\n\n").trim();
  return text.length ? text : null;
}
