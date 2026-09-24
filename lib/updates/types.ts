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
};

export type RecordUpdates = {
  canRead: boolean;
  canPost: boolean;
  count: number;
  tile: RecordUpdate | null;
  threads: Thread<RecordUpdate>[];
  mentionables: Array<{ id: string; name: string }>;
};

