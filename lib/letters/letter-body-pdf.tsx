import "server-only";
import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { LETTER_SIZES, pdfBlocks, type Line, type RichBlock, type Run } from "@/lib/letters/rich-text";

/**
 * Be Care Compliant: the words of a letter on a PDF page (Phil, 2026-10-12, Job 2 Part B,
 * docs/decisions/letter-editor.md). Every letter PDF draws its body through this one piece, so the
 * formatting the editor shows (bold, italic, underline, Small, Normal and Large text, Heading and
 * Subheading, bulleted and numbered lists) prints the same on every letter. Old plain text letters
 * are drawn by the rules they always had, the meeting details table included.
 */

const styles = StyleSheet.create({
  // A full blank line between blocks (Phil, 2026-10-12, Part C).
  para: { marginBottom: 12 },
  h2: { fontSize: LETTER_SIZES.h2, fontWeight: 700, marginTop: 6, marginBottom: 8 },
  h3: { fontSize: LETTER_SIZES.h3, fontWeight: 700, marginTop: 4, marginBottom: 6 },
  list: { marginBottom: 12 },
  listRow: { flexDirection: "row", marginBottom: 2, paddingLeft: 12 },
  // A bullet drawn at a size that reads as a bullet (Phil, 2026-10-12, Part C); a number needs more room.
  marker: { width: 14, fontSize: 14, lineHeight: 1.1 },
  number: { width: 16 },
  listText: { flex: 1 },
  detailsBox: { marginBottom: 12, paddingLeft: 12 },
  detailRow: { flexDirection: "row", marginBottom: 1 },
  detailLabel: { width: 66, fontWeight: 700 },
  detailValue: { flex: 1 },
  space: { height: 14 },
});

/** Only what a run changes: anything it leaves alone comes from around it, so a heading stays bold. */
function runStyle(r: Run) {
  return {
    ...(r.b ? { fontWeight: 700 } : {}),
    ...(r.i ? { fontStyle: "italic" as const } : {}),
    ...(r.u ? { textDecoration: "underline" as const } : {}),
    ...(r.size ? { fontSize: LETTER_SIZES[r.size] } : {}),
  };
}

/** Lines of runs inside one Text, with a line break between lines. */
function Runs({ lines }: { lines: Line[] }) {
  return (
    <>
      {lines.map((l, j) => (
        <Text key={j}>
          {j > 0 ? "\n" : ""}
          {l.map((r, k) => (
            <Text key={k} style={runStyle(r)}>
              {r.text}
            </Text>
          ))}
        </Text>
      ))}
    </>
  );
}

/** The letter's words. `tail` (the sign off) is kept on the same page as the last block, so a
 *  letter never ends with its signature alone on a page (Phil, 2026-10-12, Part C). */
export function LetterBody({ body, tail }: { body: string; tail?: ReactNode }) {
  const blocks = pdfBlocks(body);
  const drawn = blocks.map((b, i) => drawBlock(b, i));
  if (!tail) return <>{drawn}</>;
  if (!drawn.length) return <View wrap={false}>{tail}</View>;
  return (
    <>
      {drawn.slice(0, -1)}
      <View wrap={false}>
        {drawn[drawn.length - 1]}
        {tail}
      </View>
    </>
  );
}

function drawBlock(b: RichBlock, i: number): ReactNode {
  {
    {
      {
        switch (b.kind) {
          case "para":
            return (
              <Text key={i} style={styles.para}>
                <Runs lines={b.lines} />
              </Text>
            );
          case "heading":
            return (
              <Text key={i} style={b.level === 2 ? styles.h2 : styles.h3} minPresenceAhead={30}>
                <Runs lines={b.lines} />
              </Text>
            );
          case "list":
            return (
              <View key={i} style={styles.list}>
                {b.items.map((it, j) => (
                  <View key={j} style={styles.listRow} wrap={false}>
                    <Text style={b.ordered ? styles.number : styles.marker}>{b.ordered ? `${j + 1}.` : "•"}</Text>
                    <Text style={styles.listText}>
                      <Runs lines={it} />
                    </Text>
                  </View>
                ))}
              </View>
            );
          case "details":
            return (
              <View key={i} style={styles.detailsBox}>
                {b.rows.map((d, j) => (
                  <View key={j} style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{d.label}</Text>
                    <Text style={styles.detailValue}>{d.value}</Text>
                  </View>
                ))}
              </View>
            );
          case "space":
            return <View key={i} style={styles.space} />;
        }
      }
    }
  }
}
