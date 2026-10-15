/**
 * Be Care Compliant: every text is ONE SMS (Phil, 2026-10-15; docs/decisions/sms-one-segment.md).
 * Pure and importless, so node --test runs it.
 *
 * One SMS is 160 characters in the plain GSM 7 alphabet, or only 70 if a single character falls
 * outside it (a curly quote, an emoji, many accented letters). Twilio then splits the text into
 * several messages, each billed. The Return to Work text was two messages for exactly that reason.
 *
 *   1. toGsm7: curly quotes and apostrophes become straight ones, dashes become hyphens, accented
 *      letters outside the alphabet are folded to their plain letter, anything else (emoji, other
 *      scripts) is removed. What is left is always plain GSM 7.
 *   2. smsLength / smsSegments: the length as the phone network counts it (the extension
 *      characters, such as [ ] { } | ^ ~ \ and the euro sign, count twice) and how many messages
 *      that makes.
 *   3. fitSms: build the text from its parts; when it is over one SMS, shorten the variable parts
 *      in the order given (the company name first, then the first name), never the link, and
 *      refuse when it still does not fit. Nothing is ever sent as two.
 */

/** One SMS in GSM 7. */
export const SMS_GSM_LIMIT = 160;
/** One SMS once any character is outside GSM 7. */
export const SMS_UCS2_LIMIT = 70;

/* The GSM 03.38 basic character set. */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
/* The extension table: each costs two characters. */
const GSM_EXTENDED = "^{}\\[~]|€\f";

const BASIC = new Set(Array.from(GSM_BASIC));
const EXTENDED = new Set(Array.from(GSM_EXTENDED));

/** Characters we replace rather than fold. */
const REPLACE: Record<string, string> = {
  "‘": "'", // ‘
  "’": "'", // ’
  "‚": "'",
  "‛": "'",
  "′": "'",
  "`": "'", // backtick
  "´": "'", // acute accent on its own
  "“": '"', // “
  "”": '"', // ”
  "„": '"',
  "″": '"',
  "–": "-", // en dash
  "—": "-", // em dash
  "−": "-",
  "…": "...", // …
  " ": " ", // non breaking space
  " ": " ",
  " ": " ",
  "\t": " ",
};

/** Is every character plain GSM 7 (basic or extension)? */
export function isGsm7(text: string): boolean {
  for (const ch of Array.from(text)) if (!BASIC.has(ch) && !EXTENDED.has(ch)) return false;
  return true;
}

/** The text in plain GSM 7: replaced, folded, or removed character by character. */
export function toGsm7(text: string): string {
  let out = "";
  for (const ch of Array.from(String(text ?? ""))) {
    if (BASIC.has(ch) || EXTENDED.has(ch)) {
      out += ch;
      continue;
    }
    if (REPLACE[ch] !== undefined) {
      out += REPLACE[ch];
      continue;
    }
    // Fold an accented letter to its plain letter: á to a, ç to c, ł stays out (no plain form).
    const folded = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (folded && Array.from(folded).every((c) => BASIC.has(c))) {
      out += folded;
      continue;
    }
    // Anything else (an emoji, another script) is left out.
  }
  // No doubled spaces left behind by a removed character, and nothing hanging at the ends.
  return out.replace(/ {2,}/g, " ").replace(/ +([,.!?:;])/g, "$1").trim();
}

/** The length as the network counts it: GSM 7 extension characters count twice. Text outside
 *  GSM 7 is counted in UCS 2 characters. */
export function smsLength(text: string): number {
  if (!isGsm7(text)) return Array.from(text).length;
  let n = 0;
  for (const ch of Array.from(text)) n += EXTENDED.has(ch) ? 2 : 1;
  return n;
}

/** How many messages the network will split this into. */
export function smsSegments(text: string): number {
  const len = smsLength(text);
  if (len === 0) return 1;
  if (isGsm7(text)) return len <= SMS_GSM_LIMIT ? 1 : Math.ceil(len / 153);
  return len <= SMS_UCS2_LIMIT ? 1 : Math.ceil(len / 67);
}

/** A text ready to send as one SMS, or why it cannot be. */
export type FittedSms = { ok: true; text: string; length: number } | { ok: false; error: string; length: number };

/** Make a finished text safe and check it is one SMS. Used by every send, whoever built the text. */
export function oneSms(body: string): FittedSms {
  const text = toGsm7(body);
  const length = smsLength(text);
  if (!text) return { ok: false, error: "The text is empty, so it was not sent.", length };
  if (length > SMS_GSM_LIMIT) {
    return {
      ok: false,
      error: `This text is ${length} characters, more than one SMS (${SMS_GSM_LIMIT}), so it was not sent.`,
      length,
    };
  }
  return { ok: true, text, length };
}

/** A variable part of a text that may be shortened to fit, down to `min` characters. */
export type SmsPart = { key: string; value: string; min: number };

/**
 * Build a text from its variable parts and fit it into one SMS. The parts are made GSM 7 safe,
 * the text is built, and while it is over 160 the parts are cut in the order given (each no
 * shorter than its minimum). The link and the fixed words are never cut. Refuses when it still
 * does not fit.
 */
export function fitSms(build: (parts: Record<string, string>) => string, parts: SmsPart[]): FittedSms {
  const values: Record<string, string> = {};
  for (const p of parts) values[p.key] = toGsm7(p.value);
  let text = toGsm7(build(values));
  for (const p of parts) {
    let over = smsLength(text) - SMS_GSM_LIMIT;
    if (over <= 0) break;
    const current = values[p.key];
    const room = Math.max(0, Array.from(current).length - p.min);
    if (room === 0) continue;
    const keep = Array.from(current).length - Math.min(room, over);
    values[p.key] = Array.from(current).slice(0, keep).join("").trimEnd();
    text = toGsm7(build(values));
    over = smsLength(text) - SMS_GSM_LIMIT;
  }
  return oneSms(text);
}
