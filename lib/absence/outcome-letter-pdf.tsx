import "server-only";

/**
 * Be Care Compliant — the absence meeting outcome letter as a PDF, laid out exactly like the
 * invitation letter (Phil, 2026-10-07: "the same kind of format as the Thistle Care letter"): the
 * company's logo top left, its office address and phone top right, the date, the employee's name
 * and address, Dear, the RE line, the letter, and the sign off with the manager's name and role.
 * What it SAYS is decided in invitation-letter.ts (buildOutcomeLetterDoc); this only lays it out.
 * The letter goes out under the CARE COMPANY's name, so nothing on it is Be Care Compliant's.
 */

import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { OutcomeLetterDoc } from "@/lib/absence/invitation-letter";
import { LetterBody } from "@/lib/letters/letter-body-pdf";

// Never break a word in half (see lib/evidence/pdf.tsx).
Font.registerHyphenationCallback((word) => [word]);

const INK = "#111827";
const MUTED = "#4b5563";

// The same measurements as invitation-letter-pdf.tsx, so the two letters match.
const styles = StyleSheet.create({
  // 2cm side margins, 11pt text, a little more line spacing (Phil, 2026-10-12, Part C).
  page: { paddingTop: 44, paddingBottom: 40, paddingHorizontal: 56, fontSize: 11, color: INK, lineHeight: 1.4 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  logo: { maxWidth: 170, maxHeight: 70, objectFit: "contain" },
  companyName: { fontSize: 17, fontWeight: 700 },
  headRight: { alignItems: "flex-end", maxWidth: 220 },
  headLine: { fontSize: 10, textAlign: "right", lineHeight: 1.25 },
  phone: { fontSize: 10, fontWeight: 700, textAlign: "right", lineHeight: 1.25 },
  gap: { height: 4 },
  date: { textAlign: "right", marginBottom: 12 },
  // Private and confidential, in bold above the address (Phil, 2026-10-12, Part C).
  confidential: { fontWeight: 700, marginBottom: 4 },
  recipient: { marginBottom: 12 },
  // A full blank line between paragraphs (Phil, 2026-10-12, Part C).
  para: { marginBottom: 12 },
  re: { fontWeight: 700, marginBottom: 12 },
  signOff: { marginTop: 4 },
  // Unsigned: about four lines to sign by hand once printed (Phil, 2026-10-12, Part C).
  signName: { marginTop: 32, fontWeight: 700 },
  // The signer's signature, above their name (Phil, 2026-10-12, docs/decisions/letter-signatures.md).
  signImageBox: { marginTop: 6, marginBottom: 2, alignItems: "flex-start" },
  signImage: { height: 46, maxWidth: 200, objectFit: "contain" },
  signNameUnder: { fontWeight: 700 },
  // Placed from the TOP of the A4 page (841.89pt), not with bottom: 26. With a lineHeight on the
  // page, react-pdf 4 silently drops a fixed footer placed with bottom (found 2026-10-08).
  footer: { position: "absolute", top: 806, left: 56, right: 56, flexDirection: "row", justifyContent: "flex-end" },
  footerText: { fontSize: 8, color: MUTED },
});

export async function renderOutcomeLetterPdf(opts: {
  letter: OutcomeLetterDoc;
  /** data: URL of the company logo, or null to print the company name instead. */
  logoDataUrl: string | null;
  /** data: URL of the signer's signature, drawn above their name; none prints the sign off as before. */
  signatureDataUrl?: string | null;
}): Promise<Buffer> {
  const l = opts.letter;
  return renderToBuffer(
    <Document title={l.reLine.replace(/^RE:\s*/, "")} author={l.companyName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.head}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {opts.logoDataUrl ? <Image src={opts.logoDataUrl} style={styles.logo} /> : <Text style={styles.companyName}>{l.companyName}</Text>}
          <View style={styles.headRight}>
            {l.letterheadLines.map((line, i) => (
              <Text key={`a${i}`} style={styles.headLine}>{line}</Text>
            ))}
            {l.phoneLines.length > 0 ? <View style={styles.gap} /> : null}
            {l.phoneLines.map((line, i) => (
              <Text key={`p${i}`} style={styles.phone}>{line}</Text>
            ))}
          </View>
        </View>

        <Text style={styles.date}>{l.date}</Text>

        <Text style={styles.confidential}>Private and confidential</Text>
        <View style={styles.recipient}>
          {l.recipientLines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </View>

        <Text style={styles.para}>{l.salutation}</Text>
        <Text style={styles.re}>{l.reLine}</Text>

        {/* The letter as approved, with its formatting (Phil, 2026-10-12). */}
        <LetterBody
          body={l.body}
          /* The sign off never stands alone on a page: it goes with the last paragraph (Phil,
             2026-10-12, Part C). */
          tail={
            <View style={styles.signOff}>
              <Text>{l.signOff.closing}</Text>
              {opts.signatureDataUrl ? (
                <View style={styles.signImageBox}>
                  <Image src={opts.signatureDataUrl} style={styles.signImage} />
                </View>
              ) : null}
              <Text style={opts.signatureDataUrl ? styles.signNameUnder : styles.signName}>{l.signOff.name}</Text>
              {l.signOff.role ? <Text>{l.signOff.role}</Text> : null}
            </View>
          }
        />

        <View style={styles.footer} fixed>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );
}
