/** Shapes shared by the Documents reader (server) and the tile (browser). */

export type DocumentKind = "person" | "service_user";

export type RecordDocument = {
  id: string;
  title: string;
  note: string | null;
  fileName: string;
  mimeType: string;
  bytes: number;
  uploadedByName: string;
  createdAt: string;
  removedAt: string | null;
  removedByName: string | null;
  removedReason: string | null;
};

export type RecordDocuments = {
  canRead: boolean;
  canUpload: boolean;
  /** Documents still there (removed ones are listed, but not counted). */
  count: number;
  /** Newest first. */
  documents: RecordDocument[];
  /** Set when the list could not be read, so the tile says so instead of showing none. */
  loadError: string | null;
};

/** A training course the Upload can save a certificate onto (People only, for those who may
 *  record this person's training). */
export type CertificateCourse = {
  id: string;
  name: string;
  renewalMonths: number | null;
  completedOn: string | null;
  expiryOn: string | null;
  bookedFor: string | null;
  hasCertificate: boolean;
};
