import "server-only";
import { createHash } from "crypto";
import { SUBSCRIPTION_AGREEMENT_1_0, DATA_PROCESSING_AGREEMENT_1_0 } from "@/lib/legal/text";
import { SUPPLIER } from "@/lib/legal/supplier";
import { fillLegalText, missingSupplier } from "@/lib/legal/fill";

/**
 * The two documents as the app shows them today, with the supplier details filled in.
 *
 * THE VERSIONS. Accepting records these two numbers and a SHA-256 fingerprint of the exact text
 * shown. A new version (clause 19) means: add the new text to lib/legal/text.ts, point these at
 * it, and every Company Admin is asked again because their acceptance no longer matches.
 */

export const LEGAL_VERSIONS = { agreement: "1.0", dpa: "1.0" } as const;

export type LegalDocument = {
  key: "agreement" | "dpa";
  title: string;
  version: string;
  path: string;
  text: string;
  sha256: string;
};

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export function legalDocuments(): { agreement: LegalDocument; dpa: LegalDocument } {
  const a = fillLegalText(SUBSCRIPTION_AGREEMENT_1_0, SUPPLIER);
  const d = fillLegalText(DATA_PROCESSING_AGREEMENT_1_0, SUPPLIER);
  return {
    agreement: {
      key: "agreement",
      title: "Subscription Agreement",
      version: LEGAL_VERSIONS.agreement,
      path: "/terms",
      text: a,
      sha256: sha(a),
    },
    dpa: {
      key: "dpa",
      title: "Data Processing Agreement",
      version: LEGAL_VERSIONS.dpa,
      path: "/dpa",
      text: d,
      sha256: sha(d),
    },
  };
}

/** True once every supplier detail is filled in: the text is final and the gate is on for all. */
export function legalPublished(): boolean {
  return missingSupplier(SUPPLIER).length === 0;
}

export function legalMissing(): string[] {
  return missingSupplier(SUPPLIER);
}
