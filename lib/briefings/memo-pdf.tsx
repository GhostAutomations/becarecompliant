import "server-only";

/**
 * Be Care Compliant — a memo sent as a Briefing, as a PDF on the company letterhead (0435, Phil
 * 2026-10-08). Laid out like the absence letters so the company's paperwork reads as one set:
 * logo top left, office address and phone top right, then MEMO, the To / From / Date / Subject
 * block, and the memo itself. Drawn on demand from the notice row, which never changes once sent,
 * so the PDF is always exactly what was sent. Nothing on it is Be Care Compliant's.
 */

import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

Font.registerHyphenationCallback((word) => [word]);

const INK = "#111827";
const MUTED = "#4b5563";
const RULE = "#d1d5db";

// No lineHeight on the page itself: with one there, react-pdf 4 silently drops the fixed footer
// (found 2026-10-08). The paragraphs carry their own line height instead.
const styles = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 48, paddingHorizontal: 56, fontSize: 10, color: INK },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  logo: { maxWidth: 170, maxHeight: 70, objectFit: "contain" },
  companyName: { fontSize: 16, fontWeight: 700 },
  headRight: { alignItems: "flex-end", maxWidth: 220 },
  headLine: { fontSize: 9.5, textAlign: "right" },
  phone: { fontSize: 9.5, fontWeight: 700, textAlign: "right" },
  gap: { height: 6 },
  memo: { fontSize: 20, fontWeight: 700, letterSpacing: 2, marginBottom: 10 },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 60, fontWeight: 700 },
  metaValue: { flex: 1 },
  rule: { borderBottomWidth: 1, borderBottomColor: RULE, marginTop: 8, marginBottom: 14 },
  para: { marginBottom: 9 },
  // fontSize set here too: a line height is worked out from the size on the SAME style, not the
  // inherited one, so without it 1.4 came out as 1.4 x 18pt.
  line: { fontSize: 10, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 26, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 8, color: MUTED },
});

export type MemoPdfInput = {
  companyName: string;
  logoDataUrl: string | null;
  letterheadLines: string[];
  phoneLines: string[];
  to: string;
  from: string;
  date: string;
  subject: string;
  paragraphs: string[];
  attachments: string[];
  /** A preview before sending: the footer says so, nothing else changes. */
  preview?: boolean;
};

export async function renderMemoPdf(m: MemoPdfInput): Promise<Buffer> {
  return renderToBuffer(
    <Document title={m.subject} author={m.companyName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.head}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {m.logoDataUrl ? <Image src={m.logoDataUrl} style={styles.logo} /> : <Text style={styles.companyName}>{m.companyName}</Text>}
          <View style={styles.headRight}>
            {m.letterheadLines.map((line, i) => (
              <Text key={`a${i}`} style={styles.headLine}>{line}</Text>
            ))}
            {m.phoneLines.length > 0 ? <View style={styles.gap} /> : null}
            {m.phoneLines.map((line, i) => (
              <Text key={`p${i}`} style={styles.phone}>{line}</Text>
            ))}
          </View>
        </View>

        <Text style={styles.memo}>MEMO</Text>
        {[
          ["To", m.to],
          ["From", m.from],
          ["Date", m.date],
          ["Subject", m.subject],
        ].map(([label, value]) => (
          <View key={label} style={styles.metaRow}>
            <Text style={styles.metaLabel}>{label}</Text>
            <Text style={styles.metaValue}>{value}</Text>
          </View>
        ))}
        <View style={styles.rule} />

        {/* A line break they typed stays a line break: one Text per line, because a "\n" inside a
            Text with a line height doubles the gap in react-pdf. */}
        {m.paragraphs.map((p, i) => (
          <View key={i} style={styles.para}>
            {p.split("\n").map((line, j) => (
              <Text key={j} style={styles.line}>{line}</Text>
            ))}
          </View>
        ))}

        {m.attachments.length > 0 ? (
          <View style={{ marginTop: 8 }} wrap={false}>
            <Text style={{ fontWeight: 700, marginBottom: 3 }}>Attached</Text>
            {m.attachments.map((a, i) => (
              <Text key={i}>{`• ${a}`}</Text>
            ))}
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {m.companyName} · Memo{m.preview ? " · Preview, not yet sent" : ""}
          </Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );
}
