"use client";

import { useRef, useState, useTransition } from "react";
import {
  validateImportAction,
  commitImportAction,
  validateTrainingImportAction,
  commitTrainingImportAction,
} from "@/lib/import/actions";
import type { CommitOutcome } from "@/lib/import/actions";
import type { ValidateResult } from "@/lib/import/parse";
import type { TrainingValidateResult } from "@/lib/import/training";

type Pop = "people" | "service_users" | "training";

const STATUS_PILL: Record<string, string> = {
  new: "pill-green",
  duplicate: "pill-neutral",
  error: "pill-red",
};

export default function ImportUploader() {
  const [pop, setPop] = useState<Pop>("people");
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string>("");
  const [result, setResult] = useState<ValidateResult | TrainingValidateResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [flags, setFlags] = useState<CommitOutcome["flags"] | null>(null);
  const [emailNote, setEmailNote] = useState<string | null>(null);
  const [columnNotes, setColumnNotes] = useState<CommitOutcome["columnNotes"] | null>(null);
  const [pending, startTransition] = useTransition();
  /* DELAYED LOGINS (Phil, 2026-08-19). An import of forty carers emails forty people the moment
     it finishes, and whoever is importing is thinking about data, not about forty replies that
     evening. Default stays as it was — it sends — and this is the opt out. */
  const [holdLogins, setHoldLogins] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setResult(null);
    setMessage(null);
    setFlags(null);
    setEmailNote(null);
    setColumnNotes(null);
    setCsvText("");
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // The result of the LAST import must not sit above the preview of the next sheet.
    setMessage(null);
    setFlags(null);
    setEmailNote(null);
    setColumnNotes(null);
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
    startTransition(async () => {
      const res = pop === "training" ? await validateTrainingImportAction(text) : await validateImportAction(pop, text);
      setResult(res);
    });
  }

  function onCommit() {
    if (!csvText) return;
    startTransition(async () => {
      const res =
        pop === "training"
          ? await commitTrainingImportAction(csvText)
          : await commitImportAction(pop, csvText, holdLogins);
      setMessage(res.message);
      setFlags(res.flags ?? null);
      setEmailNote(res.emailNote ?? null);
      setColumnNotes(res.columnNotes ?? null);
      if (res.ok) {
        setResult(null);
        setCsvText("");
        setFileName(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  const hasFlags = Boolean(flags && (flags.skipped.length || flags.errored.length));
  const hasColumnNotes = Boolean(
    columnNotes && (columnNotes.unknown.length > 0 || columnNotes.missing.length > 0),
  );

  const counts = result && result.ok ? result.counts : null;
  const canCommit = Boolean(counts && counts.new > 0 && !pending);

  return (
    <section className="glass-card space-y-4 p-6">
      <div>
        <h2 className="text-sm font-semibold text-white/80">Step 2. Upload your sheet</h2>
        <p className="mt-1 text-sm text-white/60">
          Choose which sheet you are uploading, pick your filled CSV, and check the
          preview. Nothing is saved until you select Import.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-white/15">
          {(["people", "service_users", "training"] as Pop[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPop(p);
                reset();
              }}
              className={`px-3 py-2 text-sm ${
                pop === p
                  ? "bg-gold-400 font-semibold text-[#0f1424]"
                  : "text-white/60 hover:bg-white/5"
              }`}
            >
              {p === "people" ? "People" : p === "service_users" ? "Service Users" : "Training"}
            </button>
          ))}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="text-sm text-white/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-gold-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#0f1424] hover:file:bg-gold-400/90"
        />
        {fileName ? (
          <button type="button" onClick={reset} className="btn-outline px-3 py-1.5 text-xs">
            Clear
          </button>
        ) : null}
      </div>

      {pending && !result ? <p className="text-sm text-white/60">Checking your sheet…</p> : null}

      {message ? (
        <div className="rounded-lg border border-white/15 bg-white/5 p-3 text-sm text-white/85">
          {message}
        </div>
      ) : null}

      {/*
        The same warning the preview gave, kept ALIVE through the import. A course renamed after
        the template was downloaded no longer matches its column, and every row still reports a
        clean "new", so without this the sheet imports and says so while a whole course is dropped.
      */}
      {hasColumnNotes && columnNotes ? (
        <div className="space-y-1 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          {columnNotes.missing.length > 0 ? (
            <p>
              <span className="font-semibold">Not in your file:</span>{" "}
              {columnNotes.missing.join(", ")}. Nothing was imported for these. If a course has
              been renamed since you downloaded the template, download it again.
            </p>
          ) : null}
          {columnNotes.unknown.length > 0 ? (
            <p>
              <span className="font-semibold">Columns we do not recognise:</span>{" "}
              {columnNotes.unknown.join(", ")}. These were ignored.
            </p>
          ) : null}
        </div>
      ) : null}

      {hasFlags && flags ? (
        <div className="space-y-3 rounded-lg border border-amber-400/30 bg-amber-500/[0.06] p-4 text-sm">
          <p className="font-semibold text-white/90">Needs attention</p>
          {flags.errored.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-200">
                Not added, fix these and upload again
              </p>
              <ul className="mt-1 space-y-1 text-white/75">
                {flags.errored.map((e, i) => (
                  <li key={i}>
                    <span className="text-white/90">{e.name}</span>: {e.errors.join(" ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {flags.skipped.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Already in the system, skipped
              </p>
              <p className="mt-1 text-white/70">{flags.skipped.join(", ")}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {emailNote ? <p className="text-xs text-white/50">{emailNote}</p> : null}

      {result && !result.ok ? (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100">
          {result.error}
        </div>
      ) : null}

      {result && result.ok && counts ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="pill-green">{counts.new} to add</span>
            {result.population === "training" ? null : (
              <span className="pill-neutral">{counts.duplicate} already exist</span>
            )}
            <span className={counts.error > 0 ? "pill-red" : "pill-neutral"}>
              {counts.error} with errors
            </span>
          </div>

          {/*
            THE STALE TEMPLATE WARNING (Phil asked, 2026-08-01). A file downloaded before somebody
            renamed a course carries the old heading, and matching by name alone would skip it in
            silence. Both directions are named here, before anything is written.
          */}
          {result.population === "training" && (result.unknownColumns.length > 0 || result.missingColumns.length > 0) ? (
            <div className="space-y-1 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              {result.missingColumns.length > 0 ? (
                <p>
                  <span className="font-semibold">Not in your file:</span>{" "}
                  {result.missingColumns.join(", ")}. Nothing will be imported for these. If a
                  course has been renamed since you downloaded the template, download it again.
                </p>
              ) : null}
              {result.unknownColumns.length > 0 ? (
                <p>
                  <span className="font-semibold">Columns we do not recognise:</span>{" "}
                  {result.unknownColumns.join(", ")}. These are ignored.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="max-h-96 overflow-auto rounded-lg border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white/10 text-xs uppercase tracking-wide text-white/60">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">Dates</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.row} className="border-t border-white/5">
                    <td className="px-3 py-2 text-white/50">{r.row}</td>
                    <td className="px-3 py-2 text-white/85">{r.name || "—"}</td>
                    <td className="px-3 py-2 text-white/70">{r.branchName || "—"}</td>
                    <td className="px-3 py-2 text-white/60">
                      {r.checks.reduce((n, c) => n + c.dates.length, 0)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={STATUS_PILL[r.status]}>{r.status}</span>
                      {r.errors.length > 0 ? (
                        <span className="ml-2 text-xs text-red-200">{r.errors.join(" ")}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pop === "people" ? (
            <label className="mb-3 flex items-start gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={holdLogins}
                onChange={(e) => setHoldLogins(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Don&rsquo;t send their Team Member logins yet
                <span className="block text-xs text-white/50">
                  Everyone is imported as usual and their logins are created, but nobody is
                  emailed. Send them from Settings, Users when you are ready for the questions.
                </span>
              </span>
            </label>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCommit}
              disabled={!canCommit}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
            >
              {pending
                ? "Importing…"
                : result.ok && result.population === "training"
                  ? `Import ${result.rows.filter((r) => r.status === "new").reduce((n, r) => n + r.checks.length, 0)} training records for ${counts.new} ${counts.new === 1 ? "carer" : "carers"}`
                  : `Import ${counts.new} record${counts.new === 1 ? "" : "s"}`}
            </button>
            {counts.error > 0 ? (
              <span className="text-xs text-white/50">
                Rows with errors are skipped. Fix them in the sheet and re-upload to add them.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
