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
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { PolicyBlock } from "@/lib/policies/text";
import { DEFAULT_COLOURS, type CoverPage } from "@/lib/policies/cover";

/* Whole words only: a label such as "completing" must not break as "complet-ing". */
Font.registerHyphenationCallback((word) => [word]);

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

/**
 * THE COVER, laid out like Thistle's own policies (Phil, 2026-10-06, from their Recruitment Process
 * and Procedure). Page 1: the logo top right, the logo large in the middle, the company name in
 * the company's second colour, and a band in its main colour with the policy title. Page 2: the
 * "Audit Checklist and Report" table, then the ISO 9001 document control details and change
 * history (lib/policies/cover.ts).
 */
const BORDER = "#1f2937";
const coverStyles = StyleSheet.create({
  front: { padding: 0, fontSize: 10.5, color: INK, position: "relative" },
  cornerWrap: { position: "absolute", top: 34, right: 44, width: 170, height: 54, alignItems: "flex-end" },
  cornerLogo: { height: 54, objectFit: "contain" },
  bigLogoWrap: { position: "absolute", top: 150, left: 60, right: 60, height: 260, alignItems: "center", justifyContent: "center" },
  bigLogo: { maxHeight: 260, maxWidth: 420, objectFit: "contain" },
  frontName: { position: "absolute", top: 455, left: 30, right: 30, textAlign: "center", fontSize: 46, fontWeight: 700 },
  band: { position: "absolute", left: 0, right: 0, bottom: 0, height: 270, justifyContent: "center", paddingHorizontal: 40 },
  bandTitle: { color: "#ffffff", fontSize: 25, fontWeight: 700, textAlign: "center", lineHeight: 1.3 },
  bandRef: { color: "#ffffff", fontSize: 11, textAlign: "center", marginTop: 10 },
  second: { paddingTop: 100, paddingBottom: 56, paddingHorizontal: 54, fontSize: 10, color: INK },
  heading: { fontSize: 15, fontWeight: 700, color: "#000000", marginBottom: 10 },
  table: { borderWidth: 0.75, borderColor: BORDER },
  tRow: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: BORDER },
  tLabel: { width: 140, paddingVertical: 4.5, paddingHorizontal: 7, borderRightWidth: 0.75, borderRightColor: BORDER, fontSize: 10 },
  tValue: { flex: 1, paddingVertical: 4.5, paddingHorizontal: 7, fontSize: 10 },
  sub: { fontSize: 12, fontWeight: 700, color: "#000000", marginTop: 16, marginBottom: 6 },
});

function TableRow({ label, value, minHeight, last }: { label: string; value: string; minHeight?: number; last?: boolean }) {
  return (
    <View style={[coverStyles.tRow, last ? { borderBottomWidth: 0 } : {}, minHeight ? { minHeight } : {}]} wrap={false}>
      <Text style={coverStyles.tLabel}>{label}</Text>
      <Text style={coverStyles.tValue}>{value}</Text>
    </View>
  );
}

const HIST_WIDTHS = [52, 112, 0, 120]; // 0 = takes the rest
/** About how many two line history rows fit on a fresh page; past this the table has to split. */
const HISTORY_ROWS_PER_PAGE = 22;
function HistoryRow({ cells, bold, last }: { cells: string[]; bold?: boolean; last?: boolean }) {
  return (
    <View style={[coverStyles.tRow, last ? { borderBottomWidth: 0 } : {}]} wrap={false}>
      {cells.map((t, i) => (
        <View
          key={i}
          style={[
            HIST_WIDTHS[i] ? { width: HIST_WIDTHS[i], flexGrow: 0, flexShrink: 0 } : { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
            i < cells.length - 1 ? { borderRightWidth: 0.75, borderRightColor: BORDER } : {},
            { paddingVertical: 4.5, paddingHorizontal: 7 },
          ]}
        >
          <Text style={{ fontSize: 9.5, fontWeight: bold ? 700 : 400 }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function Cover({ c }: { c: CoverPage }) {
  const colours = c.colours ?? DEFAULT_COLOURS;
  const review = c.review;
  const audit: Array<[string, string, number?]> = review
    ? [
        ["Date of Review/ Review Completed", review.reviewedOn],
        ["Date of last Review", review.lastReviewOn],
        ["Name of Person completing the Review", review.reviewedBy],
        ["Reason for Review", review.reason, 60],
        ["Review Changes", review.changes],
        ["Next Review Date", review.nextReview],
      ]
    : [];
  const control: Array<[string, string]> = [
    ["Reference", c.reference ?? "Not set"],
    ["Version", String(c.version)],
    ["Approved on", c.approvedOn],
    ["Approved by", c.approvedBy ?? "Not recorded"],
    ["Policy owner", c.owner ?? "Not recorded"],
    ["Applies to", c.appliesTo],
    ["Read and sign", c.readBy],
    ["Retention", c.retention],
    ["Classification", c.classification],
  ];
  return (
    <>
      <Page size="A4" style={coverStyles.front}>
        {c.logoDataUrl ? (
          <View style={coverStyles.cornerWrap}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={c.logoDataUrl} style={coverStyles.cornerLogo} />
          </View>
        ) : null}
        {c.logoDataUrl ? (
          <View style={coverStyles.bigLogoWrap}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={c.logoDataUrl} style={coverStyles.bigLogo} />
          </View>
        ) : null}
        <Text style={[coverStyles.frontName, { color: colours.secondary }]}>{c.companyName}</Text>
        <View style={[coverStyles.band, { backgroundColor: colours.primary }]}>
          <Text style={coverStyles.bandTitle}>{c.title}</Text>
          {c.reference ? <Text style={coverStyles.bandRef}>{c.reference} · Version {c.version}</Text> : null}
        </View>
      </Page>
      <Page size="A4" style={coverStyles.second}>
        {c.logoDataUrl ? (
          <View style={coverStyles.cornerWrap} fixed>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={c.logoDataUrl} style={coverStyles.cornerLogo} />
          </View>
        ) : null}
        {/* A table never splits across pages (Phil, 2026-10-06): each heading and its table is one
            block, so one that will not fit starts on the next page whole. A change history longer
            than a page is the only exception, as it could not fit anywhere. */}
        {review ? (
          <View wrap={false}>
            <Text style={coverStyles.heading}>Audit Checklist and Report</Text>
            <View style={coverStyles.table}>
              {audit.map(([k, v, h], i) => (
                <TableRow key={k} label={k} value={v} minHeight={h} last={i === audit.length - 1} />
              ))}
            </View>
          </View>
        ) : null}
        <View wrap={false}>
        <Text style={review ? coverStyles.sub : coverStyles.heading}>Document control</Text>
        <View style={coverStyles.table}>
          {control.map(([k, v], i) => (
            <TableRow key={k} label={k} value={v} last={i === control.length - 1} />
          ))}
        </View>
        </View>
        <View wrap={c.history.length > HISTORY_ROWS_PER_PAGE}>
        <Text style={coverStyles.sub}>Change history</Text>
        <View style={coverStyles.table}>
          <HistoryRow cells={["Version", "Date", "What changed", "Approved by"]} bold />
          {c.history.map((h, i) => (
            <HistoryRow
              key={h.version}
              cells={[String(h.version), h.date, h.change, h.approvedBy ?? ""]}
              last={i === c.history.length - 1}
            />
          ))}
        </View>
        </View>
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {c.reference ? `${c.reference} · ` : ""}
            {c.title} · version {c.version}
          </Text>
          <Text style={styles.footerText}>Uncontrolled when printed. The current version is held in Be Care Compliant.</Text>
        </View>
      </Page>
    </>
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
