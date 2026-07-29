import "server-only";

/**
 * Be Care Compliant — branded evidence PDF renderer (Phase 2).
 *
 * On submission a completed Form is rendered to this immutable PDF, which is the
 * inspector-facing evidence stored in the private bucket. Rendered from the same
 * FormSchema + answers the app validated, using the shared answer formatter, so
 * the PDF always matches the stored data. Engine: @react-pdf/renderer (pure JS,
 * runs in a Vercel serverless function, no headless browser).
 *
 * This module is the single place evidence PDFs are produced; Phase 8 exports
 * reuse it. Navy + gold brand, no dashes in copy.
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
import {
  type AnswerValue,
  type Answers,
  type FormSchema,
  isPresentational,
} from "@/lib/form-schema";
import { shouldShowInEvidence } from "@/lib/form-validate";
import { formatAnswerForDisplay } from "@/lib/form-format";

/**
 * Never break a word in half.
 *
 * Phil, 2026-07-29: a long field label printed as "conversa tion". @react-pdf/renderer
 * hyphenates by default, and with no hyphen drawn it reads as a typo in a compliance
 * document. Returning the word whole tells it to wrap between words instead. Registered
 * once, at module level, so every evidence PDF this module renders behaves the same.
 */
Font.registerHyphenationCallback((word) => [word]);

export type EvidencePdfMeta = {
  companyName: string;
  branchName?: string | null;
  formName: string;
  formVersion: number;
  authorName?: string | null;
  authorEmail?: string | null;
  submittedAt: Date;
  /** Short evidence id shown as a reference on the document. */
  evidenceRef: string;
};

const NAVY = "#081231";
const NAVY_SOFT = "#14306b";
const GOLD = "#f59e0b";
const INK = "#0d1d4b";
const MUTED = "#5b6b8c";

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 44, fontSize: 10, color: INK },
  brandBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: GOLD, paddingBottom: 10, marginBottom: 16 },
  brand: { fontSize: 16, fontWeight: 700, color: NAVY },
  brandSub: { fontSize: 9, color: MUTED, marginTop: 2 },
  evidenceTag: { fontSize: 8, color: MUTED, textAlign: "right" },
  title: { fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 2 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, marginBottom: 18 },
  metaCell: { width: "50%", marginBottom: 6 },
  metaLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase" },
  metaValue: { fontSize: 10, color: INK, marginTop: 1 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: NAVY_SOFT, backgroundColor: "#eef1f8", paddingVertical: 5, paddingHorizontal: 8, marginBottom: 8 },
  fieldRow: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#dfe4f0" },
  fieldLabel: { width: "42%", color: MUTED, paddingRight: 8 },
  fieldValue: { width: "58%", color: INK },
  subHeading: { fontSize: 10, fontWeight: 700, color: NAVY_SOFT, marginTop: 6, marginBottom: 2 },
  // Width only, so @react-pdf keeps the captured aspect ratio and the ink is never
  // squashed or stretched. The pad is a 480x160 canvas, so 180pt wide lands at 60pt
  // tall. No background colour, no tint: the image is drawn exactly as it was signed.
  signatureImage: { width: 180, marginTop: 2, marginBottom: 2 },
  signatureCaption: { fontSize: 8, color: MUTED },
  footer: { position: "absolute", bottom: 28, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: "#dfe4f0", paddingTop: 6 },
  footerText: { fontSize: 8, color: MUTED },
});

function formatWhen(d: Date): string {
  // Europe/London, no dashes.
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * A drawn signature held in the answer, ready to draw on the page.
 *
 * Phil, 2026-07-29: the PDF printed the words "Signature captured" where the person
 * had actually signed, so an inspector saw a claim instead of the signature. The
 * shared renderer captures a drawn signature as a PNG data URL held in the ANSWER
 * (components/forms/form-renderer.tsx), not as a stored file, so the PDF has the
 * image in hand and can simply draw it.
 *
 * Deliberately strict, and it mirrors the on screen Evidence page one for one: only a
 * png or jpeg data URL is drawn. Anything else (missing, a stored file path, a pasted
 * string, an svg) returns null and the row falls back to the shared formatter, exactly
 * as before. A truncated or corrupt data URL is safe too: @react-pdf swallows an image
 * it cannot decode with a console warning and lays the node out at zero size, so one
 * bad signature can never fail the whole record's PDF.
 */
function drawnSignature(value: AnswerValue | undefined): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.startsWith("data:image/png;base64,") || v.startsWith("data:image/jpeg;base64,")
    ? v
    : null;
}

/**
 * One evidence entry: title, meta grid and answered sections. Exported so the
 * Phase 8 Evidence pack can render many evidences into a single Document with the
 * exact same layout as a standalone evidence PDF (no divergence, one source).
 */
export function EvidenceEntry({ schema, answers, meta }: { schema: FormSchema; answers: Answers; meta: EvidencePdfMeta }) {
  const author = meta.authorName || meta.authorEmail || "Not recorded";
  return (
    <>
      <Text style={styles.title}>{meta.formName}</Text>

      <View style={styles.metaGrid}>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Company</Text>
          <Text style={styles.metaValue}>{meta.companyName}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Branch</Text>
          <Text style={styles.metaValue}>{meta.branchName || "Not set"}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Completed by</Text>
          <Text style={styles.metaValue}>{author}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Completed at (Europe/London)</Text>
          <Text style={styles.metaValue}>{formatWhen(meta.submittedAt)}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Form version</Text>
          <Text style={styles.metaValue}>Version {meta.formVersion}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Evidence reference</Text>
          <Text style={styles.metaValue}>{meta.evidenceRef}</Text>
        </View>
      </View>

      {schema.sections.map((section) => {
        // shouldShowInEvidence, not plain visibility: a conditional field nobody was
        // asked is left out, but anything actually answered is always printed. The on
        // screen Evidence page filters with the same function.
        const visible = section.fields.filter((f) => shouldShowInEvidence(f, answers));
        if (visible.length === 0) return null;
        return (
          <View key={section.id} style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {visible.map((field) => {
              if (isPresentational(field.type)) {
                return (
                  <Text key={field.key} style={styles.subHeading}>
                    {field.label}
                  </Text>
                );
              }
              const value = answers[field.key];
              // Only a signature gets the image treatment. Every other field type still
              // goes through the shared formatter, so the PDF and the Evidence page can
              // never drift apart.
              const signature = field.type === "signature" ? drawnSignature(value) : null;
              return (
                <View key={field.key} style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  {signature ? (
                    <View style={styles.fieldValue}>
                      <Image src={signature} style={styles.signatureImage} />
                      <Text style={styles.signatureCaption}>Signature captured</Text>
                    </View>
                  ) : (
                    <Text style={styles.fieldValue}>{formatAnswerForDisplay(field, value)}</Text>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
    </>
  );
}

function EvidenceDocument({ schema, answers, meta }: { schema: FormSchema; answers: Answers; meta: EvidencePdfMeta }) {
  return (
    <Document title={`${meta.formName} evidence`} author="Be Care Compliant">
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar}>
          <View>
            <Text style={styles.brand}>Be Care Compliant</Text>
            <Text style={styles.brandSub}>Compliance evidence record</Text>
          </View>
          <Text style={styles.evidenceTag}>Evidence reference{"\n"}{meta.evidenceRef}</Text>
        </View>

        <EvidenceEntry schema={schema} answers={answers} meta={meta} />

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Immutable evidence generated by Be Care Compliant. Reference {meta.evidenceRef}.
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

/** Render the completed form to an immutable PDF buffer. */
export async function renderEvidencePdf(
  schema: FormSchema,
  answers: Answers,
  meta: EvidencePdfMeta,
): Promise<Buffer> {
  return renderToBuffer(<EvidenceDocument schema={schema} answers={answers} meta={meta} />);
}
