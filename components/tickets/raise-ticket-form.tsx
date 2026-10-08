"use client";

/**
 * Raise a ticket (Phil, 2026-10-08).
 *
 * Report a problem: where it is (the departments in their own sidebar, then that department's
 * sections), a subject, a description and up to three screenshots. Request a new feature: what it
 * should be called, a description, and the chargeable acknowledgement. Both take a RAG rating.
 *
 * Everything typed is held in state and posted by hand, so a refused save never wipes it
 * (standing rule, 2026-10-01).
 */

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { raiseTicket } from "@/lib/tickets/actions";
import { IDLE_STATE } from "@/lib/forms";
import {
  FEATURE_ACK,
  MAX_SCREENSHOTS,
  TICKET_KINDS,
  TICKET_RAGS,
  ticketProblem,
  type TicketKind,
  type TicketRag,
} from "@/lib/tickets/options";

export type TicketDepartment = { label: string; areas: string[] };

export default function RaiseTicketForm({ departments }: { departments: TicketDepartment[] }) {
  const [state, action] = useActionState(raiseTicket, IDLE_STATE);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<TicketKind | "">("");
  const [department, setDepartment] = useState("");
  const [area, setArea] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [rag, setRag] = useState<TicketRag | "">("");
  const [ack, setAck] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const areas = useMemo(
    () => departments.find((d) => d.label === department)?.areas ?? [],
    [departments, department],
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (areas.length > 0 && kind === "problem" && !area) {
      setProblem(`Choose which part of ${department}.`);
      return;
    }
    const p = ticketProblem({ kind, department, subject, description, rag, ack });
    setProblem(p);
    if (p) return;
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("department", department);
    fd.set("area", area);
    fd.set("subject", subject);
    fd.set("description", description);
    fd.set("rag", rag);
    if (ack) fd.set("ack", "1");
    for (const f of files) fd.append("screenshots", f);
    startTransition(() => action(fd));
  }

  const busy = pending;
  const isFeature = kind === "feature";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="glass-card space-y-5 p-5">
        <div>
          <label htmlFor="t-kind" className="form-label">What do you need?</label>
          <select
            id="t-kind"
            value={kind}
            disabled={busy}
            onChange={(e) => {
              setKind(e.target.value as TicketKind | "");
              setProblem(null);
            }}
          >
            <option value="">Please choose</option>
            {TICKET_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>

        {kind === "problem" ? (
          <>
            <div>
              <label htmlFor="t-dept" className="form-label">Where is the problem?</label>
              <select
                id="t-dept"
                value={department}
                disabled={busy}
                onChange={(e) => {
                  setDepartment(e.target.value);
                  setArea("");
                }}
              >
                <option value="">Please choose</option>
                {departments.map((d) => (
                  <option key={d.label} value={d.label}>{d.label}</option>
                ))}
              </select>
            </div>
            {areas.length > 0 ? (
              <div>
                <label htmlFor="t-area" className="form-label">Which part of {department}?</label>
                <select id="t-area" value={area} disabled={busy} onChange={(e) => setArea(e.target.value)}>
                  <option value="">Please choose</option>
                  {areas.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </>
        ) : null}

        {kind ? (
          <>
            <div>
              <label htmlFor="t-subject" className="form-label">{isFeature ? "Feature name" : "Subject"}</label>
              <input
                id="t-subject"
                type="text"
                maxLength={200}
                value={subject}
                disabled={busy}
                placeholder={isFeature ? "What should it be called?" : "A short summary of the problem"}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="t-desc" className="form-label">Description</label>
              <textarea
                id="t-desc"
                rows={7}
                maxLength={10000}
                value={description}
                disabled={busy}
                placeholder={
                  isFeature
                    ? "Give as much information as possible."
                    : "Give as much information as possible: what you were doing, what you expected, and what happened instead."
                }
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="t-shots" className="form-label">Screenshots (up to {MAX_SCREENSHOTS}, optional)</label>
              <input
                id="t-shots"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/heic"
                multiple
                disabled={busy}
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  setFiles(picked.slice(0, MAX_SCREENSHOTS));
                  setProblem(picked.length > MAX_SCREENSHOTS ? `Only the first ${MAX_SCREENSHOTS} screenshots will be sent.` : null);
                }}
              />
              {files.length > 0 ? (
                <p className="mt-1 text-xs text-white/60">{files.map((f) => f.name).join(", ")}</p>
              ) : null}
            </div>

            <fieldset>
              <legend className="form-label">How urgent is it?</legend>
              <div className="mt-1 grid gap-2 sm:grid-cols-3">
                {TICKET_RAGS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    disabled={busy}
                    aria-pressed={rag === r.value}
                    onClick={() => setRag(r.value)}
                    className={`rounded-xl border p-3 text-left text-sm transition ${
                      rag === r.value ? "border-gold-400 bg-gold-400/15" : "border-white/10 bg-white/5"
                    }`}
                  >
                    <span className={`pill ${r.pill}`}>{r.label}</span>
                    <span className="mt-2 block text-white/80">{r.meaning}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {isFeature ? (
              <label className="flex items-start gap-2 text-sm text-white/80">
                <input type="checkbox" checked={ack} disabled={busy} onChange={(e) => setAck(e.target.checked)} />
                <span>{FEATURE_ACK}</span>
              </label>
            ) : null}
          </>
        ) : null}
      </div>

      {problem ? <p className="form-error">{problem}</p> : null}
      {state.error && !problem ? (
        <p className="form-error">
          {state.error}{" "}
          {state.data?.ticketId ? (
            <Link href={`/tickets/${state.data.ticketId}`} className="underline">Open the ticket</Link>
          ) : null}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy || !kind}>
          {busy ? "Raising…" : "Raise ticket"}
        </button>
        <Link href="/tickets" className="btn-ghost px-3 py-2 text-sm">Cancel</Link>
      </div>
    </form>
  );
}
