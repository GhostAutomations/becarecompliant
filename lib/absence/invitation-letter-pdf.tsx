import "server-only";

/**
 * Be Care Compliant — the absence meeting invitation letter as a PDF (Phil, 2026-10-06), laid out
 * like Thistle Care's own: the company's logo top left, its office address and phone top right,
 * the date, the employee's name and address, Dear, the RE line, the letter, the absences it is
 * about, and the sign off. What it SAYS is decided in invitation-letter.ts; this only lays it out.
 * The letter goes out under the CARE COMPANY's name, so nothing on it is Be Care Compliant's.
 */

import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { bodyBlocks, type InvitationLetter } from "@/lib/absence/invitation-letter";

// Never break a word in half (see lib/evidence/pdf.tsx).
Font.registerHyphenationCallback((word) => [word]);

const INK = "#111827";
const MUTED = "#4b5563";

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
  detailsBox: { marginBottom: 10, paddingLeft: 12 },
  detailRow: { flexDirection: "row", marginBottom: 2 },
  detailLabel: { width: 60, fontWeight: 700 },
  detailValue: { flex: 1 },
  bulletRow: { flexDirection: "row", marginBottom: 2, paddingLeft: 12 },
  bullet: { width: 12 },
  bulletText: { flex: 1 },
  signOff: { marginTop: 4 },
  signName: { marginTop: 16, fontWeight: 700 },
  notice: { fontSize: 8.5, color: MUTED, marginBottom: 10 },
  // Placed from the TOP of the A4 page (841.89pt), not with bottom: 26. With a lineHeight on the
  // page, react-pdf 4 silently drops a fixed footer placed with bottom (found 2026-10-08).
  footer: { position: "absolute", top: 806, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 8, color: MUTED },
});

export async function renderInvitationLetterPdf(opts: {
  letter: InvitationLetter;
  /** data: URL of the company logo, or null to print the company name instead. */
  logoDataUrl: string | null;
  /** A line above the letter, e.g. that this copy was made afterwards. */
  notice?: string | null;
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

        {opts.notice ? <Text style={styles.notice}>{opts.notice}</Text> : null}

        <Text style={styles.date}>{l.date}</Text>

        <View style={styles.recipient}>
          {l.recipientLines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </View>

        <Text style={styles.para}>{l.salutation}</Text>
        <Text style={styles.re}>{l.reLine}</Text>

        {/* The letter between the RE line and Yours sincerely, drawn from its text (the Book meeting
            box), so what was read and edited there is exactly what prints (Phil, 2026-10-08). */}
        {bodyBlocks(l.body).map((b, i) =>
          b.kind === "text" ? (
            <Text key={i} style={styles.para}>{b.text}</Text>
          ) : b.kind === "details" ? (
            <View key={i} style={styles.detailsBox}>
              {b.rows.map((d, j) => (
                <View key={j} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{d.label}</Text>
                  <Text style={styles.detailValue}>{d.value}</Text>
                </View>
              ))}
            </View>
          ) : b.kind === "bullets" ? (
            <View key={i} style={{ marginBottom: 8 }}>
              {b.lines.map((line, j) => (
                <View key={j} style={styles.bulletRow} wrap={false}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.bulletText}>{line}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View key={i} style={{ height: 10 }} />
          ),
        )}

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
