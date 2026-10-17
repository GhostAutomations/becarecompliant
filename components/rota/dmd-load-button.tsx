"use client";

/** The Founder loads the NHS medicines list now (Rota and Visits Stage 6). */

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DmdLoadButton() {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; msg: string | null; err: boolean }>({ busy: false, msg: null, err: false });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-outline px-3 py-1.5 text-xs"
        disabled={state.busy}
        onClick={async () => {
          setState({ busy: true, msg: "Loading the NHS list, this takes about a minute…", err: false });
          const res = await fetch("/api/rota/dmd-load", { method: "POST" });
          const body = (await res.json().catch(() => ({}))) as { ok?: boolean; release?: string; products?: number; skipped?: boolean; error?: string };
          if (body.ok) {
            setState({ busy: false, msg: `Loaded release ${body.release}: ${body.products?.toLocaleString("en-GB")} medicines${body.skipped ? " (already loaded)" : ""}.`, err: false });
            router.refresh();
          } else {
            setState({ busy: false, msg: body.error ?? "The NHS list could not be loaded.", err: true });
          }
        }}
      >
        {state.busy ? "Loading…" : "Load the NHS list now"}
      </button>
      {state.msg ? <span className={`text-xs ${state.err ? "text-red-300" : "text-emerald-300"}`}>{state.msg}</span> : null}
    </div>
  );
}
