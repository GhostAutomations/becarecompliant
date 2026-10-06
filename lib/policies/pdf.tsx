import "server-only";

/**
 * Be Care Compliant — a written policy, rendered as the document of record.
 *
 * A pasted policy is still EVIDENCE: when somebody signs version 3, an inspector
 * two years later must be able to see version 3 exactly as it read. So the text
 * is frozen into a real PDF at save time, stored in the same private bucket as an
 * uploaded document, and everything downstream (versions, certificate, exports,
 * RLS) carries on unchanged.
 *
 * Same engine and brand as the certificate (@react-pdf/renderer), so no new
 * dependency and one visual language across everything we produce.
 */

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { PolicyBlock } from "@/lib/policies/text";
import type { CoverPage } from "@/lib/policies/cover";

const NAVY = "#081231";
const GOLD = "#f59e0b";
const INK = "#0d1d4b";
const MUTED = "#5b6b8c";

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 44, fontSize: 10.5, color: INK },
  brandBar: {
    borderBottomWidth: 2,
    borderBottomColor: GOLD,
    paddingBottom: 10,
    marginBottom: 20,
  },
  title: { fontSize: 17, fontWeight: 700, color: NAVY },
  meta: { fontSize: 9, color: MUTED, marginTop: 3 },
  h1: { fontSize: 14, fontWeight: 700, color: NAVY, marginTop: 16, marginBottom: 6 },
  h2: { fontSize: 12, fontWeight: 700, color: NAVY, marginTop: 14, marginBottom: 5 },
  h3: { fontSize: 11, fontWeight: 700, color: NAVY, marginTop: 12, marginBottom: 4 },
  para: { marginBottom: 8, lineHeight: 1.5 },
  listRow: { flexDirection: "row", marginBottom: 5 },
  listMarker: { width: 18, color: MUTED },
  listText: { flex: 1, lineHeight: 1.5 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#dfe4f0",
    paddingTop: 6,
  },
  footerText: { fontSize: 8, color: MUTED },
  coverCompany: { fontSize: 11, color: MUTED, marginTop: 40 },
  coverTitle: { fontSize: 24, fontWeight: 700, color: NAVY, marginTop: 8 },
  coverRef: { fontSize: 11, color: GOLD, fontWeight: 700, marginTop: 6, marginBottom: 26 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#dfe4f0", paddingVertical: 6 },
  rowLabel: { width: 150, fontSize: 9.5, color: MUTED },
  rowValue: { flex: 1, fontSize: 10, color: INK },
  histHead: { fontSize: 12, fontWeight: 700, color: NAVY, marginTop: 24, marginBottom: 6 },
  histRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#dfe4f0", paddingVertical: 4 },
  histCell: { fontSize: 9, color: INK },
});

/** The ISO 9001 style cover (lib/policies/cover.ts): who, what, which version, until when. */
function Cover({ c }: { c: CoverPage }) {
  const rows: Array<[string, string]> = [
    ["Reference", c.reference ?? "Not set"],
    ["Version", String(c.version)],
    ["Approved on", c.approvedOn],
    ["Approved by", c.approvedBy ?? "Not recorded"],
    ["Policy owner", c.owner ?? "Not recorded"],
    ["Next review due", c.nextReview ?? "Not set"],
    ["Applies to", c.appliesTo],
    ["Read and sign", c.readBy],
    ["Retention", c.retention],
    ["Classification", c.classification],
  ];
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.coverCompany}>{c.companyName}</Text>
      <Text style={styles.coverTitle}>{c.title}</Text>
      <Text style={styles.coverRef}>{c.reference ?? ""}</Text>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.row}>
          <Text style={styles.rowLabel}>{k}</Text>
          <Text style={styles.rowValue}>{v}</Text>
        </View>
      ))}
      <Text style={styles.histHead}>Change history</Text>
      <View style={[styles.histRow, { borderBottomColor: GOLD }]}>
        <Text style={[styles.histCell, { width: 50, color: MUTED }]}>Version</Text>
        <Text style={[styles.histCell, { width: 80, color: MUTED }]}>Date</Text>
        <Text style={[styles.histCell, { flex: 1, color: MUTED }]}>What changed</Text>
        <Text style={[styles.histCell, { width: 130, color: MUTED }]}>Approved by</Text>
      </View>
      {c.history.map((h) => (
        <View key={h.version} style={styles.histRow} wrap={false}>
          <Text style={[styles.histCell, { width: 50 }]}>{h.version}</Text>
          <Text style={[styles.histCell, { width: 80 }]}>{h.date}</Text>
          <Text style={[styles.histCell, { flex: 1 }]}>{h.change}</Text>
          <Text style={[styles.histCell, { width: 130 }]}>{h.approvedBy ?? ""}</Text>
        </View>
      ))}
      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>
          {c.reference ? `${c.reference} · ` : ""}
          {c.title} · version {c.version}
        </Text>
        <Text style={styles.footerText}>Uncontrolled when printed. The current version is held in Be Care Compliant.</Text>
      </View>
    </Page>
  );
}

function Spans({ block }: { block: PolicyBlock }) {
  return (
    <>
      {block.spans.map((s, i) => (
        <Text key={i} style={s.bold ? { fontWeight: 700 } : undefined}>
          {s.text}
        </Text>
      ))}
    </>
  );
}

export async function renderPolicyPdf(opts: {
  companyName: string;
  title: string;
  version: number;
  blocks: PolicyBlock[];
  /** Europe/London date the version was saved. */
  savedAt: Date;
  /** The cover page, for every policy written in Be Care Compliant (0404). */
  cover?: CoverPage | null;
}): Promise<Buffer> {
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(opts.savedAt);

  return renderToBuffer(
    <Document title={`${opts.title} (version ${opts.version})`} author={opts.companyName}>
      {opts.cover ? <Cover c={opts.cover} /> : null}
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} fixed>
          <Text style={styles.title}>{opts.title}</Text>
          <Text style={styles.meta}>
            {opts.cover?.reference ? `${opts.cover.reference} · ` : ""}
            {opts.companyName} · Version {opts.version} · Issued {when}
          </Text>
        </View>

        {opts.blocks.map((block, i) => {
          if (block.kind === "heading") {
            const style = block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3;
            return (
              <Text key={i} style={style}>
                <Spans block={block} />
              </Text>
            );
          }
          if (block.kind === "bullet" || block.kind === "numbered") {
            return (
              <View key={i} style={styles.listRow} wrap={false}>
                <Text style={styles.listMarker}>
                  {block.kind === "bullet" ? "•" : block.marker}
                </Text>
                <Text style={styles.listText}>
                  <Spans block={block} />
                </Text>
              </View>
            );
          }
          return (
            <Text key={i} style={styles.para}>
              <Spans block={block} />
            </Text>
          );
        })}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {opts.cover?.reference ? `${opts.cover.reference} · ` : ""}
            {opts.title} · version {opts.version}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>,
  );
}
