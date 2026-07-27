import "server-only";

/**
 * Be Care Compliant — "who has signed it, and who has not".
 *
 * Phil, 2026-07-27: clicking Evidence on a briefing used to open ONE person's
 * Policy Acknowledgement, which answers a question nobody asks. What a manager
 * (and an inspector) wants is the whole picture for that policy: everyone it went
 * to, who has signed, when, and who is still outstanding.
 *
 * Generated live on every request and stored nowhere: "if a policy is sent out at
 * 8am and someone checks that policy hourly, they get a real time update every
 * time they press evidence". The heading carries the timestamp so a printed copy
 * can never be mistaken for today's position.
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
const GOLD = "#f59e0b";
const INK = "#0d1d4b";
const MUTED = "#5b6b8c";
const RED = "#b42318";
const GREEN = "#067647";

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 40, fontSize: 9.5, color: INK },
  brandBar: { borderBottomWidth: 2, borderBottomColor: GOLD, paddingBottom: 9, marginBottom: 16 },
  title: { fontSize: 16, fontWeight: 700, color: NAVY },
  meta: { fontSize: 8.5, color: MUTED, marginTop: 3 },
  tiles: { flexDirection: "row", marginBottom: 18 },
  tile: { width: "25%" },
  tileNum: { fontSize: 18, fontWeight: 700, color: NAVY },
  tileLabel: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", marginTop: 2 },
  section: { fontSize: 11, fontWeight: 700, color: NAVY, marginTop: 12, marginBottom: 6 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e6e9f2", paddingVertical: 5 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#c9d0e3", paddingBottom: 4 },
  headText: { fontSize: 7.5, color: MUTED, textTransform: "uppercase" },
  name: { width: "38%" },
  branch: { width: "24%", color: MUTED },
  when: { width: "26%" },
  state: { width: "12%", textAlign: "right" },
  empty: { fontSize: 9, color: MUTED, marginTop: 4 },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#dfe4f0",
    paddingTop: 6,
  },
  footerText: { fontSize: 7.5, color: MUTED },
});

export type ReportPerson = {
  name: string;
  branch: string | null;
  /** When they signed or completed it. */
  doneAt?: string | null;
  dueDate?: string | null;
  daysLate?: number | null;
};

export type BriefingReport = {
  companyName: string;
  title: string;
  kind: "policy" | "form";
  version: number | null;
  generatedAt: Date;
  done: ReportPerson[];
  outstanding: ReportPerson[];
};

function when(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso));
}

export async function renderBriefingReport(r: BriefingReport): Promise<Buffer> {
  const sent = r.done.length + r.outstanding.length;
  const overdue = r.outstanding.filter((p) => (p.daysLate ?? 0) > 0).length;
  const verb = r.kind === "policy" ? "Signed" : "Completed";

  return renderToBuffer(
    <Document title={`${r.title} — who has signed`} author={r.companyName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} fixed>
          <Text style={styles.title}>{r.title}</Text>
          <Text style={styles.meta}>
            {r.companyName}
            {r.version ? ` · Version ${r.version}` : ""} · {verb} and outstanding · Correct at{" "}
            {when(r.generatedAt)}
          </Text>
        </View>

        <View style={styles.tiles}>
          <View style={styles.tile}>
            <Text style={styles.tileNum}>{sent}</Text>
            <Text style={styles.tileLabel}>Sent to</Text>
          </View>
          <View style={styles.tile}>
            <Text style={{ ...styles.tileNum, color: GREEN }}>{r.done.length}</Text>
            <Text style={styles.tileLabel}>{verb}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileNum}>{r.outstanding.length}</Text>
            <Text style={styles.tileLabel}>Outstanding</Text>
          </View>
          <View style={styles.tile}>
            <Text style={{ ...styles.tileNum, color: overdue > 0 ? RED : NAVY }}>{overdue}</Text>
            <Text style={styles.tileLabel}>Overdue</Text>
          </View>
        </View>

        <Text style={styles.section}>
          {verb} ({r.done.length})
        </Text>
        {r.done.length === 0 ? (
          <Text style={styles.empty}>Nobody yet.</Text>
        ) : (
          <>
            <View style={styles.head} fixed>
              <Text style={{ ...styles.headText, ...styles.name }}>Name</Text>
              <Text style={{ ...styles.headText, ...styles.branch }}>Branch</Text>
              <Text style={{ ...styles.headText, ...styles.when }}>{verb} at</Text>
              <Text style={{ ...styles.headText, ...styles.state }}>Status</Text>
            </View>
            {r.done.map((p, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.branch}>{p.branch ?? "—"}</Text>
                <Text style={styles.when}>{p.doneAt ? shortDate(p.doneAt) : "—"}</Text>
                <Text style={{ ...styles.state, color: GREEN }}>Done</Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.section}>Outstanding ({r.outstanding.length})</Text>
        {r.outstanding.length === 0 ? (
          <Text style={styles.empty}>Nobody outstanding. Everyone it was sent to has responded.</Text>
        ) : (
          <>
            <View style={styles.head} fixed>
              <Text style={{ ...styles.headText, ...styles.name }}>Name</Text>
              <Text style={{ ...styles.headText, ...styles.branch }}>Branch</Text>
              <Text style={{ ...styles.headText, ...styles.when }}>Due</Text>
              <Text style={{ ...styles.headText, ...styles.state }}>Status</Text>
            </View>
            {r.outstanding.map((p, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.branch}>{p.branch ?? "—"}</Text>
                <Text style={styles.when}>{p.dueDate ? shortDate(p.dueDate) : "No date"}</Text>
                <Text style={{ ...styles.state, color: (p.daysLate ?? 0) > 0 ? RED : MUTED }}>
                  {(p.daysLate ?? 0) > 0 ? `${p.daysLate}d late` : "Waiting"}
                </Text>
              </View>
            ))}
          </>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {r.companyName} · {r.title}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Live position at ${when(r.generatedAt)} · Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>,
  );
}
