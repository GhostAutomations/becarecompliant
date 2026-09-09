/**
 * Be Care Compliant — how the subject of a piece of Evidence is WORDED.
 *
 * Pure, so it can be unit tested and so the words an inspector reads are pinned by a
 * test rather than by whichever renderer happens to run. lib/evidence/subject.ts does
 * the reading from the database and hands the result to the PDF.
 */

export type EvidenceRecordType = "person" | "service_user" | "complaint";

export type EvidenceSubject = {
  kind: EvidenceRecordType;
  /** What to call this kind of record on the page: "Care Worker", "Service User". */
  label: string;
  /** The name printed as the document's subject. */
  name: string;
  /** Their own identifier, printed beneath the name when they have one: an SCW
   *  registration number for a care worker, the SSID for a service user. */
  reference?: string | null;
  /** A second line of context, printed small: a job title, for instance. */
  detail?: string | null;
};

export function labelFor(kind: EvidenceRecordType): string {
  if (kind === "person") return "Care Worker";
  if (kind === "service_user") return "Service User";
  return "Complaint";
}

/**
 * The record could not be read: deleted, or purged under the retention rule while the
 * Evidence itself was kept. Printed as it is, in plain words. It is not a blank and not
 * an error, because the document is still the true record of a check that happened — an
 * inspector needs to see that the subject is gone, not be handed a nameless form.
 */
export function notOnFile(kind: EvidenceRecordType, recordId: string): EvidenceSubject {
  return {
    kind,
    label: labelFor(kind),
    name: "Record no longer held",
    reference: recordId.slice(0, 8).toUpperCase(),
    detail: "The record this evidence belongs to has been removed.",
  };
}

/**
 * One line naming the subject, for a page footer: "Joe Bloggs (Care Worker)". Kept here
 * so the block at the top of the page and the footer under it cannot drift apart.
 */
export function describeSubject(subject: EvidenceSubject): string {
  return `${subject.name} (${subject.label})`;
}
