import "server-only";

/**
 * Be Care Compliant — the absence meeting outcome letter as a PDF (Phil, 2026-09-29).
 *
 * The same letter the email carries, as a document the employee can keep or print and that stays
 * on the meeting: the manager's copy of what was sent. Same engine and brand as the policy PDF.
 * The letter goes out under the CARE COMPANY's name, so the heading is theirs.
 */

import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

// Never break a word in half (see lib/evidence/pdf.tsx).
Font.registerHyphenationCallback((word) => [word]);

const NAVY = "#081231";
const GOLD = "#f59e0b";
const INK = "#0d1d4b";
const MUTED = "#5b6b8c";

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 52, fontSize: 11, color: INK },
  brandBar: { borderBottomWidth: 2, borderBottomColor: GOLD, paddingBottom: 10, marginBottom: 22 },
  company: { fontSize: 16, fontWeight: 700, color: NAVY },
  marking: { fontSize: 9, color: MUTED, marginTop: 3 },
  date: { marginBottom: 14 },
  subject: { fontWeight: 700, color: NAVY, marginBottom: 14 },
  para: { marginBottom: 10, lineHeight: 1.5 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 52,
    right: 52,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#dfe4f0",
    paddingTop: 6,
  },
  footerText: { fontSize: 8, color: MUTED },
});

export async function renderOutcomeLetterPdf(opts: {
  companyName: string;
  /** dd/mm/yyyy */
  letterDate: string;
  subject: string;
  paragraphs: string[];
}): Promise<Buffer> {
  return renderToBuffer(
    <Document title={opts.subject} author={opts.companyName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} fixed>
          <Text style={styles.company}>{opts.companyName}</Text>
          <Text style={styles.marking}>Private and confidential</Text>
        </View>
        <Text style={styles.date}>{opts.letterDate}</Text>
        <Text style={styles.subject}>{opts.subject}</Text>
        {opts.paragraphs.map((p, i) => (
          <Text key={i} style={styles.para}>
            {p}
          </Text>
        ))}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{opts.subject}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>,
  );
}
