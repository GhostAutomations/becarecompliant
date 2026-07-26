import "server-only";

/**
 * Be Care Compliant — the signature certificate.
 *
 * Phil chose this over stamping the original PDF (2026-07-26): the policy
 * document stays the untouched master, and each signature produces its own one
 * page certificate, which is the thing you hand an inspector or email to the
 * person. Same engine and brand as the evidence PDF (@react-pdf/renderer, pure
 * JS, no headless browser), so nothing new was added to the project.
 *
 * What makes it worth anything is the specificity: the policy TITLE and VERSION,
 * the signer, the exact time in Europe/London, and the signature itself, drawn or
 * typed. A signature that does not name the version proves nothing.
 */

import {
  Document,
  Image,
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

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 44, fontSize: 10, color: INK },
  brandBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: GOLD,
    paddingBottom: 10,
    marginBottom: 22,
  },
  brand: { fontSize: 16, fontWeight: 700, color: NAVY },
  brandSub: { fontSize: 9, color: MUTED, marginTop: 2 },
  tag: { fontSize: 8, color: MUTED, textAlign: "right" },
  title: { fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 4 },
  lede: { fontSize: 10, color: MUTED, marginBottom: 24 },
  statement: { fontSize: 12, color: INK, lineHeight: 1.5, marginBottom: 24 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 24 },
  metaCell: { width: "50%", marginBottom: 12 },
  metaLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase" },
  metaValue: { fontSize: 11, color: INK, marginTop: 2 },
  signBlock: { borderTopWidth: 0.5, borderTopColor: "#dfe4f0", paddingTop: 16, marginTop: 8 },
  signLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", marginBottom: 6 },
  signImage: { height: 70, width: 220, objectFit: "contain" },
  signTyped: { fontSize: 20, color: NAVY_SOFT, marginTop: 4, marginBottom: 4 },
  signRule: { borderBottomWidth: 0.5, borderBottomColor: "#9fabc7", width: 260, marginTop: 4 },
  signName: { fontSize: 10, color: INK, marginTop: 6 },
  note: { fontSize: 8, color: MUTED, marginTop: 18, lineHeight: 1.4 },
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

export type CertificateMeta = {
  companyName: string;
  policyTitle: string;
  policyVersion: number;
  policyFileName: string;
  signerName: string;
  signedAt: Date;
  /** A drawn signature as a PNG data URL, when they drew one. */
  signatureDataUrl?: string | null;
  /** The typed name, when they typed instead. */
  typedSignature?: string | null;
  /** Short reference, the evidence id. */
  reference: string;
};

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export async function renderCertificate(meta: CertificateMeta): Promise<Buffer> {
  return renderToBuffer(
    <Document
      title={`${meta.policyTitle} signature certificate`}
      author={meta.companyName}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar}>
          <View>
            <Text style={styles.brand}>Be Care Compliant</Text>
            <Text style={styles.brandSub}>{meta.companyName}</Text>
          </View>
          <Text style={styles.tag}>Reference {meta.reference.slice(0, 8)}</Text>
        </View>

        <Text style={styles.title}>Certificate of signature</Text>
        <Text style={styles.lede}>
          This certificate records that a member of the team has read and signed a company
          policy.
        </Text>

        <Text style={styles.statement}>
          {meta.signerName} confirmed they have read and understood {meta.policyTitle},
          version {meta.policyVersion}, and signed to that effect on{" "}
          {formatWhen(meta.signedAt)}.
        </Text>

        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Policy</Text>
            <Text style={styles.metaValue}>{meta.policyTitle}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Version</Text>
            <Text style={styles.metaValue}>{meta.policyVersion}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Signed by</Text>
            <Text style={styles.metaValue}>{meta.signerName}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Signed at</Text>
            <Text style={styles.metaValue}>{formatWhen(meta.signedAt)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Document</Text>
            <Text style={styles.metaValue}>{meta.policyFileName}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Company</Text>
            <Text style={styles.metaValue}>{meta.companyName}</Text>
          </View>
        </View>

        <View style={styles.signBlock}>
          <Text style={styles.signLabel}>Signature</Text>
          {meta.signatureDataUrl ? (
            <Image style={styles.signImage} src={meta.signatureDataUrl} />
          ) : meta.typedSignature ? (
            <Text style={styles.signTyped}>{meta.typedSignature}</Text>
          ) : (
            <Text style={styles.signTyped}> </Text>
          )}
          <View style={styles.signRule} />
          <Text style={styles.signName}>{meta.signerName}</Text>
        </View>

        <Text style={styles.note}>
          {meta.typedSignature && !meta.signatureDataUrl
            ? "Signed by typing their full name, which their employer accepts as their signature."
            : "Signed by hand on a screen."}{" "}
          The version named above is retained unchanged, so the exact wording that was
          signed can always be produced.
        </Text>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{meta.companyName}</Text>
          <Text style={styles.footerText}>
            Certificate of signature, reference {meta.reference.slice(0, 8)}
          </Text>
        </View>
      </Page>
    </Document>,
  );
}
