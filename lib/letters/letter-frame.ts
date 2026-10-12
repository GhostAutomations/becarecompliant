/**
 * Be Care Compliant: everything a letter PDF prints around its words (Phil, 2026-10-12: the editor
 * must look exactly like the PDF). The letterhead, the date, Private and confidential, the address,
 * Dear, the RE line, and the sign off with its signature, name and job title. The server hands it
 * to the editor with each preview, so the sheet shows the whole letter, and only the words in the
 * middle can be typed in.
 *
 * Pure and importless so node --test can load it.
 */

export type LetterFrame = {
  companyName: string;
  /** A data: URL of the company logo, or null to print the company name. */
  logoUrl: string | null;
  letterheadLines: string[];
  phoneLines: string[];
  date: string;
  recipientLines: string[];
  salutation: string;
  reLine: string;
  signOff: { closing: string; name: string; role: string | null };
  /** A data: URL of the signature drawn above the name, or null for room to sign by hand. */
  signatureUrl: string | null;
};

/** The frame of a built invitation or outcome letter, ready to send to the editor. */
export function letterFrameOf(
  l: {
    companyName: string;
    letterheadLines: string[];
    phoneLines: string[];
    date: string;
    recipientLines: string[];
    salutation: string;
    reLine: string;
    signOff: { closing: string; name: string; role: string | null };
  },
  logoUrl: string | null | undefined,
  signatureUrl: string | null | undefined,
): LetterFrame {
  return {
    companyName: l.companyName,
    logoUrl: logoUrl ?? null,
    letterheadLines: l.letterheadLines,
    phoneLines: l.phoneLines,
    date: l.date,
    recipientLines: l.recipientLines,
    salutation: l.salutation,
    reLine: l.reLine,
    signOff: l.signOff,
    signatureUrl: signatureUrl ?? null,
  };
}
