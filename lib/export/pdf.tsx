import "server-only";

/**
 * Be Care Compliant — the ONE branded report PDF builder (Phase 8).
 *
 * Every report PDF (register report, branch/company compliance, per record
 * Evidence pack cover, audit trail) is rendered here from a small structured
 * document model, so the brand, layout and page furniture stay identical and no
 * report hand rolls its own @react-pdf tree. Evidence PDFs themselves keep their
 * own deterministic renderer (lib/evidence/pdf.tsx); this builder composes
 * reports around and alongside them.
 *
 * Navy + gold brand mirroring the evidence renderer. No dashes in any copy.
 * Engine: @react-pdf/renderer (pure JS, runs in a Vercel serverless function).
 */

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

const NAVY = "#081231";
const NAVY_SOFT = "#14306b";
const GOLD = "#f59e0b";
const INK = "#0d1d4b";
const MUTED = "#5b6b8c";

/** RAG chip palette: soft fill, strong text, readable on white (WCAG AA). */
const RAG = {
  green: { bg: "#dcfce7", fg: "#166534" },
  amber: { bg: "#fef3c7", fg: "#92400e" },
  red: { bg: "#fee2e2", fg: "#991b1b" },
  neutral: { bg: "#eef1f8", fg: "#334155" },
} as const;

export type RagTone = keyof typeof RAG;

export type ReportMetaPair = { label: string; value: string };
export type ReportColumn = { header: string; width?: string; align?: "left" | "right" };
export type ReportCell = { text: string; rag?: RagTone; strong?: boolean };
export type ReportBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "keyvalues"; pairs: ReportMetaPair[] }
  | { kind: "table"; columns: ReportColumn[]; rows: ReportCell[][]; caption?: string; emptyText?: string }
  | { kind: "spacer" };

export type ReportDoc = {
  title: string;
  subtitle?: string;
  /** Short reference printed top right and in the footer. */
  reference?: string;
  /** Top meta grid (company, branch, generated at, prepared by, and so on). */
  meta?: ReportMetaPair[];
  blocks: ReportBlock[];
  /** Extra line in the footer, e.g. the exclusion note. */
  footerNote?: string;
  landscape?: boolean;
};

const styles = StyleSheet.create({
  page: { paddingTop: 46, paddingBottom: 56, paddingHorizontal: 40, fontSize: 9.5, color: INK },
  brandBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: GOLD, paddingBottom: 10, marginBottom: 14 },
  brand: { fontSize: 16, fontWeight: 700, color: NAVY },
  brandSub: { fontSize: 9, color: MUTED, marginTop: 2 },
  refTag: { fontSize: 8, color: MUTED, textAlign: "right" },
  title: { fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 1 },
  subtitle: { fontSize: 10, color: MUTED, marginBottom: 8 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6, marginBottom: 14 },
  metaCell: { width: "33.33%", marginBottom: 6, paddingRight: 8 },
  metaLabel: { fontSize: 7.5, color: MUTED, textTransform: "uppercase" },
  metaValue: { fontSize: 9.5, color: INK, marginTop: 1 },
  heading: { fontSize: 11, fontWeight: 700, color: NAVY_SOFT, backgroundColor: "#eef1f8", paddingVertical: 5, paddingHorizontal: 8, marginTop: 6, marginBottom: 8 },
  paragraph: { fontSize: 9.5, color: INK, marginBottom: 8, lineHeight: 1.4 },
  caption: { fontSize: 8, color: MUTED, marginBottom: 4 },
  tableHeadRow: { flexDirection: "row", backgroundColor: NAVY, paddingVertical: 5, paddingHorizontal: 6 },
  tableHeadCell: { fontSize: 8, fontWeight: 700, color: "#ffffff" },
  tableRow: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: "#dfe4f0" },
  tableRowAlt: { backgroundColor: "#f7f9fd" },
  tableCell: { fontSize: 8.5, color: INK, paddingRight: 6 },
  chip: { alignSelf: "flex-start", borderRadius: 3, paddingVertical: 1.5, paddingHorizontal: 5, fontSize: 8, fontWeight: 700 },
  emptyText: { fontSize: 9, color: MUTED, fontStyle: "italic", paddingVertical: 6 },
  footer: { position: "absolute", bottom: 26, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: "#dfe4f0", paddingTop: 6 },
  footerRow: { flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 7.5, color: MUTED },
});

function metaCells(pairs: ReportMetaPair[]) {
  return pairs.map((p, i) => (
    <View key={`${p.label}-${i}`} style={styles.metaCell}>
      <Text style={styles.metaLabel}>{p.label}</Text>
      <Text style={styles.metaValue}>{p.value || "Not set"}</Text>
    </View>
  ));
}

function Cell({ cell, column }: { cell: ReportCell; column: ReportColumn }) {
  const align = column.align === "right" ? { textAlign: "right" as const } : {};
  const width = { width: column.width ?? `${100 / 1}%` };
  if (cell.rag) {
    const tone = RAG[cell.rag];
    return (
      <View style={[styles.tableCell, width]}>
        <Text style={[styles.chip, { backgroundColor: tone.bg, color: tone.fg }]}>{cell.text}</Text>
      </View>
    );
  }
  return (
    <Text style={[styles.tableCell, width, align, cell.strong ? { fontWeight: 700 } : {}]}>
      {cell.text}
    </Text>
  );
}

function TableBlock({ columns, rows, caption, emptyText }: Extract<ReportBlock, { kind: "table" }>) {
  const widths = columns.map((c) => c.width ?? `${100 / columns.length}%`);
  return (
    <View style={{ marginBottom: 12 }}>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      <View style={styles.tableHeadRow} wrap={false}>
        {columns.map((c, i) => (
          <Text
            key={c.header + i}
            style={[styles.tableHeadCell, { width: widths[i] }, c.align === "right" ? { textAlign: "right" } : {}]}
          >
            {c.header}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <Text style={styles.emptyText}>{emptyText ?? "Nothing to report."}</Text>
      ) : (
        rows.map((row, ri) => (
          <View key={ri} style={[styles.tableRow, ri % 2 === 1 ? styles.tableRowAlt : {}]} wrap={false}>
            {row.map((cell, ci) => (
              <Cell key={ci} cell={cell} column={{ ...columns[ci], width: widths[ci] }} />
            ))}
          </View>
        ))
      )}
    </View>
  );
}

function ReportDocument({ doc }: { doc: ReportDoc }) {
  return (
    <Document title={doc.title} author="Be Care Compliant">
      <Page size="A4" orientation={doc.landscape ? "landscape" : "portrait"} style={styles.page}>
        <View style={styles.brandBar}>
          <View>
            <Text style={styles.brand}>Be Care Compliant</Text>
            <Text style={styles.brandSub}>Compliance report</Text>
          </View>
          {doc.reference ? (
            <Text style={styles.refTag}>Reference{"\n"}{doc.reference}</Text>
          ) : null}
        </View>

        <Text style={styles.title}>{doc.title}</Text>
        {doc.subtitle ? <Text style={styles.subtitle}>{doc.subtitle}</Text> : null}

        {doc.meta && doc.meta.length > 0 ? (
          <View style={styles.metaGrid}>{metaCells(doc.meta)}</View>
        ) : null}

        {doc.blocks.map((block, i) => {
          if (block.kind === "heading") return <Text key={i} style={styles.heading}>{block.text}</Text>;
          if (block.kind === "paragraph") return <Text key={i} style={styles.paragraph}>{block.text}</Text>;
          if (block.kind === "keyvalues")
            return <View key={i} style={styles.metaGrid}>{metaCells(block.pairs)}</View>;
          if (block.kind === "spacer") return <View key={i} style={{ height: 10 }} />;
          return <TableBlock key={i} {...block} />;
        })}

        <View style={styles.footer} fixed>
          {doc.footerNote ? <Text style={styles.footerText}>{doc.footerNote}</Text> : null}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>
              Generated by Be Care Compliant{doc.reference ? `. Reference ${doc.reference}.` : "."}
            </Text>
            <Text
              style={styles.footerText}
              render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
                `Page ${pageNumber} of ${totalPages}`
              }
            />
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Render a structured report document to a PDF buffer. */
export async function renderReportPdf(doc: ReportDoc): Promise<Buffer> {
  return renderToBuffer(<ReportDocument doc={doc} />);
}
