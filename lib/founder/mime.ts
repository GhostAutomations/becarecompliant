/**
 * Be Care Compliant — reading a header out of a raw email.
 *
 * PURE, no runtime imports.
 *
 * WHY THIS EXISTS. The founder inbox showed "phil.davies@outlook.com" where Outlook and Apple
 * Mail show "Phil Davies". The display name is in the message's own From header, and the mail
 * provider's parsed fields do not reliably carry it — its dashboard shows the bare address too.
 * The original message is available, so the name is read from that.
 *
 * Two things make this less trivial than a split on ":":
 *   - headers FOLD across lines, continuing with leading whitespace, and
 *   - non-ASCII names are encoded (RFC 2047), so "Seán Ó Braonáin" arrives as =?UTF-8?B?...?=.
 */

/** The header block is everything before the first blank line. */
export function headerBlock(raw: string): string {
  const end = raw.search(/\r?\n\r?\n/);
  return end === -1 ? raw : raw.slice(0, end);
}

/**
 * One header's value, unfolded. Case insensitive, first occurrence wins — which is what a mail
 * client does, and matters because a forged second From is a known trick.
 */
export function headerFromRaw(raw: string, name: string): string | null {
  const lines = headerBlock(raw).split(/\r?\n/);
  const wanted = name.toLowerCase();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    if (line.slice(0, colon).trim().toLowerCase() !== wanted) continue;

    let value = line.slice(colon + 1).trim();
    // Folded continuation lines begin with a space or tab.
    for (let j = i + 1; j < lines.length && /^[ \t]/.test(lines[j]); j += 1) {
      value += ` ${lines[j].trim()}`;
    }
    return value.trim() || null;
  }
  return null;
}

/**
 * Decode RFC 2047 encoded words, so an accented or non-Latin name reads as itself rather than as
 * =?UTF-8?B?U2XDoW4=?=. Anything it cannot decode is left exactly as it was: a name shown oddly
 * is a great deal better than a name replaced by an error.
 */
export function decodeEncodedWords(value: string): string {
  return value.replace(
    /=\?([A-Za-z0-9_-]+)\?([BbQq])\?([^?]*)\?=/g,
    (whole, _charset: string, encoding: string, text: string) => {
      try {
        if (encoding.toUpperCase() === "B") {
          const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
          return new TextDecoder("utf-8").decode(bytes);
        }
        // Q encoding: underscores are spaces, =XX is a byte.
        const bytes: number[] = [];
        const q = text.replace(/_/g, " ");
        for (let i = 0; i < q.length; i += 1) {
          if (q[i] === "=" && i + 2 < q.length) {
            bytes.push(parseInt(q.slice(i + 1, i + 3), 16));
            i += 2;
          } else {
            bytes.push(q.charCodeAt(i));
          }
        }
        return new TextDecoder("utf-8").decode(Uint8Array.from(bytes));
      } catch {
        return whole;
      }
    },
  );
}

/** The From header of a raw message, decoded, ready for parseFrom. */
export function fromHeaderOf(raw: string): string | null {
  const value = headerFromRaw(raw, "from");
  return value ? decodeEncodedWords(value) : null;
}
