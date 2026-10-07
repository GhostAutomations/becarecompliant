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

// Never break a word in half (see lib/evidence/pdf.tsx).
Font.registerHyphenationCallback((word) => [word]);

const INK = "#111827";
const MUTED = "#4b5563";

// The same measurements as invitation-letter-pdf.tsx, so the two letters match.
const styles = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 48, paddingHorizontal: 56, fontSize: 10, color: INK, lineHeight: 1.35 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  logo: { maxWidth: 170, maxHeight: 70, objectFit: "contain" },
  companyName: { fontSize: 16, fontWeight: 700 },
  headRight: { alignItems: "flex-end", maxWidth: 220 },
  headLine: { fontSize: 9.5, textAlign: "right" },
  phone: { fontSize: 9.5, fontWeight: 700, textAlign: "right" },
  gap: { height: 6 },
  date: { textAlign: "right", marginBottom: 8 },
  recipient: { marginBottom: 12 },
  para: { marginBottom: 8 },
  re: { fontWeight: 700, marginBottom: 8 },
  signOff: { marginTop: 4 },
  signName: { marginTop: 16, fontWeight: 700 },
  footer: { position: "absolute", bottom: 26, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 8, color: MUTED },
});

export async function renderOutcomeLetterPdf(opts: {
  letter: OutcomeLetterDoc;
  /** data: URL of the company logo, or null to print the company name instead. */
  logoDataUrl: string | null;
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

        <View style={styles.recipient}>
          {l.recipientLines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </View>

        <Text style={styles.para}>{l.salutation}</Text>
        <Text style={styles.re}>{l.reLine}</Text>

        {/* A single line break the manager typed is kept as a line break, a blank line starts a
            new paragraph, so they can space the letter as they like. */}
        {l.paragraphs.map((p, i) => (
          <Text key={i} style={styles.para}>{p}</Text>
        ))}

        <View style={styles.signOff} wrap={false}>
          <Text>{l.signOff.closing}</Text>
          <Text style={styles.signName}>{l.signOff.name}</Text>
          {l.signOff.role ? <Text>{l.signOff.role}</Text> : null}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Private and confidential</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );
}
