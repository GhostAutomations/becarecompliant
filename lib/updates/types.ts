/** Shapes shared by the Updates reader (server) and the tile (browser). */
import type { Thread } from "./rules";

export type RecordRef = { kind: "person"; id: string } | { kind: "service_user"; id: string };

export type UpdateFile = { id: string; fileName: string; mimeType: string; bytes: number };

export type RecordUpdate = {
  id: string;
  parentId: string | null;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  pinnedAt: string | null;
  removedAt: string | null;
  removedReason: string | null;
  files: UpdateFile[];
  mentions: string[];
  /** What the update is about (0374): a check on this record, DBS renewal or Right to Work. */
  aboutLabel: string | null;
  /** Why the check was late, in words (0375), and for a DBS renewal when the application went in. */
  lateReason: string | null;
  dbsSubmittedOn: string | null;
};

export type RecordUpdates = {
  canRead: boolean;
  canPost: boolean;
  count: number;
  tile: RecordUpdate | null;
  threads: Thread<RecordUpdate>[];
  mentionables: Array<{ id: string; name: string }>;
  /** What a new update can be about: this record's checks, and a person's DBS and Right to Work.
   *  value is "check:<instance id>", "dbs_renewal" or "right_to_work" (lib/updates/about.ts). */
  aboutChoices: Array<{ value: string; label: string }>;
};

