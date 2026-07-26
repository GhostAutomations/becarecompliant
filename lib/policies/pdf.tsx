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
});

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
}): Promise<Buffer> {
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(opts.savedAt);

  return renderToBuffer(
    <Document title={`${opts.title} (version ${opts.version})`} author={opts.companyName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} fixed>
          <Text style={styles.title}>{opts.title}</Text>
          <Text style={styles.meta}>
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
