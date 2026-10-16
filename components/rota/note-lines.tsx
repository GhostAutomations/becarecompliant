/**
 * Be Care Compliant: one carer's care notes and concerns on a visit, for the office (Rota and Visits
 * Stage 5; docs/decisions/rota-visits.md, Stage 5 decisions 5, 8, 9 and 10). Shown on the Visits
 * page and the service user's Care notes page. A clocked out carer with no note shows "No note".
 */

import Link from "next/link";
import { CONCERN_STATUS_WORDS } from "@/lib/rota/notes";
import type { VisitConcernLine, VisitNoteLine } from "@/lib/rota/types";

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

export default function NoteLines({
  notes,
  concerns,
  personId,
  clockedOut,
}: {
  notes: VisitNoteLine[];
  concerns: VisitConcernLine[];
  personId: string;
  clockedOut: boolean;
}) {
  const mine = notes.filter((n) => n.personId === personId);
  const myConcerns = concerns.filter((c) => c.personId === personId);
  const byId = new Map(notes.map((n) => [n.id, n]));
  if (mine.length === 0 && myConcerns.length === 0) {
    return clockedOut ? <p className="mt-1 text-xs text-amber-300">No note</p> : null;
  }
  return (
    <div className="mt-1 space-y-1">
      {mine.map((n) => {
        const corrects = n.correctsNoteId ? byId.get(n.correctsNoteId) : null;
        const correctedBy = notes.find((x) => x.correctsNoteId === n.id);
        return (
          <div key={n.id} className="rounded-lg bg-white/5 px-2 py-1.5">
            <p className="text-[11px] text-white/50">
              Note {hhmm(n.at)}
              {n.forNextCarer ? " · for the next carer" : ""}
              {corrects ? ` · correction to the ${hhmm(corrects.at)} note` : ""}
              {correctedBy ? ` · corrected at ${hhmm(correctedBy.at)}` : ""}
              {n.flags.includes("offline") ? " · recorded offline, sent later" : ""}
            </p>
            <p className={`whitespace-pre-wrap text-xs ${correctedBy ? "text-white/45" : "text-white/85"}`}>{n.body}</p>
          </div>
        );
      })}
      {myConcerns.map((c) => (
        <div key={c.id} className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5">
          <p className="text-[11px] text-red-200">
            Concern {hhmm(c.at)} · {c.category} · {CONCERN_STATUS_WORDS[c.status] ?? c.status}
          </p>
          <p className="whitespace-pre-wrap text-xs text-white/85">{c.body}</p>
          <Link href={`/rota/concerns?concern=${c.id}`} className="text-[11px] text-amber-300 underline">
            Open the concern
          </Link>
        </div>
      ))}
    </div>
  );
}
