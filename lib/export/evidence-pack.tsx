import "server-only";

/**
 * Be Care Compliant — inspection ready Evidence pack (Phase 8).
 *
 * All completed Evidence for one Person or one Service User, gathered into a
 * single branded PDF a manager can hand to a CQC or CIW inspector or a local
 * authority contract officer, plus a CSV index of the same evidence. Each entry
 * shows the author, the completion timestamp and the exact form version, which
 * is precisely what the CQC single assessment framework (processes and outcomes)
 * and the CIW quality of care review expect: who did what, when, and on which
 * version of the record.
 *
 * Rendered as ONE @react-pdf Document (cover page + each Evidence via the shared
 * EvidenceEntry) so a pack looks identical to a standalone evidence PDF and needs
 * no PDF merging library. Read through the caller's RLS client, so a pack only
 * ever contains evidence the caller may see. No dashes in copy.
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { isFormSchema, type Answers, type FormSchema } from "@/lib/form-schema";
import { EvidenceEntry, type EvidencePdfMeta } from "@/lib/evidence/pdf";
import { buildCsv } from "@/lib/export/csv";
import { fmtDate, fmtDateTime, generatedAt } from "@/lib/export/format";

const NAVY = "#081231";
const GOLD = "#f59e0b";
const INK = "#0d1d4b";
const MUTED = "#5b6b8c";

const styles = StyleSheet.create({
  page: { paddingTop: 46, paddingBottom: 56, paddingHorizontal: 44, fontSize: 10, color: INK },
  brandBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: GOLD, paddingBottom: 10, marginBottom: 16 },
  brand: { fontSize: 16, fontWeight: 700, color: NAVY },
  brandSub: { fontSize: 9, color: MUTED, marginTop: 2 },
  coverTitle: { fontSize: 18, fontWeight: 700, color: NAVY, marginTop: 12, marginBottom: 2 },
  coverSub: { fontSize: 11, color: MUTED, marginBottom: 18 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
  metaCell: { width: "50%", marginBottom: 8 },
  metaLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase" },
  metaValue: { fontSize: 11, color: INK, marginTop: 1 },
  note: { fontSize: 9, color: MUTED, lineHeight: 1.4, marginTop: 8 },
  indexHead: { fontSize: 12, fontWeight: 700, color: NAVY, marginTop: 12, marginBottom: 6 },
  indexRow: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#dfe4f0" },
  idxRef: { width: "16%", fontSize: 8.5, color: MUTED },
  idxForm: { width: "44%", fontSize: 8.5, color: INK },
  idxWhen: { width: "40%", fontSize: 8.5, color: INK },
  footer: { position: "absolute", bottom: 28, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: "#dfe4f0", paddingTop: 6 },
  footerText: { fontSize: 8, color: MUTED },
});

type PackEvidence = {
  id: string;
  schema_snapshot: unknown;
  answers: Answers;
  author_name: string | null;
  author_email: string | null;
  submitted_at: string;
  form_versions: { version: number } | null;
  forms: { name: string } | null;
  branches: { name: string } | null;
};

export type EvidencePackData = {
  companyName: string;
  branchName: string | null;
  recordName: string;
  recordKind: "Person" | "Service User";
  evidence: PackEvidence[];
};

function shortRef(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function PackDocument({ data }: { data: EvidencePackData }) {
  const when = generatedAt();
  const entries = data.evidence.filter((e) => isFormSchema(e.schema_snapshot));
  return (
    <Document title={`Evidence pack for ${data.recordName}`} author="Be Care Compliant">
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar}>
          <View>
            <Text style={styles.brand}>Be Care Compliant</Text>
            <Text style={styles.brandSub}>Inspection ready evidence pack</Text>
          </View>
        </View>

        <Text style={styles.coverTitle}>{data.recordName}</Text>
        <Text style={styles.coverSub}>{data.recordKind} evidence pack</Text>

        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Company</Text>
            <Text style={styles.metaValue}>{data.companyName}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Branch</Text>
            <Text style={styles.metaValue}>{data.branchName || "Not set"}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Evidence records</Text>
            <Text style={styles.metaValue}>{String(entries.length)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Generated at (Europe/London)</Text>
            <Text style={styles.metaValue}>{when}</Text>
          </View>
        </View>

        <Text style={styles.indexHead}>Contents</Text>
        {entries.length === 0 ? (
          <Text style={styles.note}>No completed evidence has been recorded for this record yet.</Text>
        ) : (
          entries.map((e) => (
            <View key={e.id} style={styles.indexRow}>
              <Text style={styles.idxRef}>{shortRef(e.id)}</Text>
              <Text style={styles.idxForm}>
                {e.forms?.name ?? "Form"} (version {e.form_versions?.version ?? 1})
              </Text>
              <Text style={styles.idxWhen}>{fmtDateTime(e.submitted_at)}</Text>
            </View>
          ))
        )}

        <Text style={styles.note}>
          Each completed Form in this pack is immutable evidence, stored with the author, the completion
          time and the exact form version used. This pack supports the CQC single assessment framework
          processes and outcomes evidence categories and the CIW quality of care review.
        </Text>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Evidence pack for {data.recordName}. Generated {when}.</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>

      {entries.map((e) => {
        const meta: EvidencePdfMeta = {
          companyName: data.companyName,
          branchName: e.branches?.name ?? data.branchName,
          formName: e.forms?.name ?? "Form",
          formVersion: e.form_versions?.version ?? 1,
          authorName: e.author_name,
          authorEmail: e.author_email,
          submittedAt: new Date(e.submitted_at),
          evidenceRef: shortRef(e.id),
        };
        return (
          <Page key={e.id} size="A4" style={styles.page} break>
            <View style={styles.brandBar}>
              <View>
                <Text style={styles.brand}>Be Care Compliant</Text>
                <Text style={styles.brandSub}>Compliance evidence record</Text>
              </View>
              <Text style={[styles.footerText, { textAlign: "right" }]}>
                {data.recordName}
                {"\n"}
                {shortRef(e.id)}
              </Text>
            </View>
            <EvidenceEntry schema={e.schema_snapshot as FormSchema} answers={e.answers ?? {}} meta={meta} />
            <View style={styles.footer} fixed>
              <Text style={styles.footerText}>Evidence pack for {data.recordName}.</Text>
              <Text
                style={styles.footerText}
                render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
                  `Page ${pageNumber} of ${totalPages}`
                }
              />
            </View>
          </Page>
        );
      })}
    </Document>
  );
}

/** Gather a record's evidence pack data through the caller's RLS client. */
export async function getEvidencePackData(
  recordType: "person" | "service_user",
  recordId: string,
): Promise<{ ok: true; data: EvidencePackData } | { ok: false; error: string }> {
  const supabase = await createClient();

  let recordName = "";
  let branchName: string | null = null;
  let companyId: string | null = null;

  if (recordType === "person") {
    const { data: p } = await supabase
      .from("people")
      .select("full_name, company_id, branches(name)")
      .eq("id", recordId)
      .maybeSingle<{ full_name: string; company_id: string; branches: { name: string } | null }>();
    if (!p) return { ok: false, error: "That record could not be found, or you cannot access it." };
    recordName = p.full_name;
    branchName = p.branches?.name ?? null;
    companyId = p.company_id;
  } else {
    const { data: su } = await supabase
      .from("service_users")
      .select("full_name, company_id, branches(name)")
      .eq("id", recordId)
      .maybeSingle<{ full_name: string; company_id: string; branches: { name: string } | null }>();
    if (!su) return { ok: false, error: "That record could not be found, or you cannot access it." };
    recordName = su.full_name;
    branchName = su.branches?.name ?? null;
    companyId = su.company_id;
  }

  const [{ data: company }, { data: evidence }] = await Promise.all([
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle<{ name: string }>(),
    supabase
      .from("evidence")
      .select(
        "id, schema_snapshot, answers, author_name, author_email, submitted_at, form_versions(version), forms(name), branches(name)",
      )
      .eq("record_type", recordType)
      .eq("record_id", recordId)
      .is("anonymised_at", null)
      .order("submitted_at", { ascending: true }),
  ]);

  return {
    ok: true,
    data: {
      companyName: company?.name ?? "Company",
      branchName,
      recordName,
      recordKind: recordType === "person" ? "Person" : "Service User",
      evidence: (evidence as PackEvidence[]) ?? [],
    },
  };
}

/** Render the pack PDF buffer. */
export async function renderEvidencePackPdf(data: EvidencePackData): Promise<Buffer> {
  return renderToBuffer(<PackDocument data={data} />);
}

/** CSV index of the pack's evidence (same order as the PDF). */
export function evidencePackCsv(data: EvidencePackData): string {
  const rows = data.evidence
    .filter((e) => isFormSchema(e.schema_snapshot))
    .map((e) => [
      shortRef(e.id),
      e.forms?.name ?? "Form",
      e.form_versions?.version ?? 1,
      e.author_name || e.author_email || "Not recorded",
      fmtDate(e.submitted_at),
      fmtDateTime(e.submitted_at),
      e.branches?.name ?? data.branchName ?? "",
    ]);
  return buildCsv(
    ["Reference", "Form", "Version", "Completed by", "Completed on", "Completed at", "Branch"],
    rows,
  );
}
