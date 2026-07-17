"use client";

import { useRef, useState, useTransition } from "react";
import { validateImportAction, commitImportAction } from "@/lib/import/actions";
import type { ValidateResult } from "@/lib/import/parse";

type Pop = "people" | "service_users";

const STATUS_PILL: Record<string, string> = {
  new: "pill-green",
  duplicate: "pill-neutral",
  error: "pill-red",
};

export default function ImportUploader() {
  const [pop, setPop] = useState<Pop>("people");
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string>("");
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setResult(null);
    setMessage(null);
    setCsvText("");
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage(null);
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
    startTransition(async () => {
      const res = await validateImportAction(pop, text);
      setResult(res);
    });
  }

  function onCommit() {
    if (!csvText) return;
    startTransition(async () => {
      const res = await commitImportAction(pop, csvText);
      setMessage(res.message);
      if (res.ok) {
        setResult(null);
        setCsvText("");
        setFileName(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

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
          {(["people", "service_users"] as Pop[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPop(p);
                reset();
              }}
              className={`px-3 py-2 text-sm ${
                pop === p ? "bg-gold-400/20 text-white" : "text-white/60 hover:bg-white/5"
              }`}
            >
              {p === "people" ? "People" : "Service Users"}
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

      {result && !result.ok ? (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100">
          {result.error}
        </div>
      ) : null}

      {result && result.ok && counts ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="pill-green">{counts.new} to add</span>
            <span className="pill-neutral">{counts.duplicate} already exist</span>
            <span className={counts.error > 0 ? "pill-red" : "pill-neutral"}>
              {counts.error} with errors
            </span>
          </div>

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

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCommit}
              disabled={!canCommit}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
            >
              {pending ? "Importing…" : `Import ${counts.new} record${counts.new === 1 ? "" : "s"}`}
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
