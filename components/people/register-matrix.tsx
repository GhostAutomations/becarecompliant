"use client";

/**
 * Be Care Compliant — the People register as a compliance matrix (Phase 3),
 * mirroring the manager's Monday board column for column. Sticky Carer column;
 * recurring checks (Manual Handling, Medication Competency, Spot Check, Appraisal,
 * Supervision 1/2/3) show their due dates with RAG; directly-recorded trackers
 * (DBS, Enhanced DBS, Right to Work + limits, Probation) show as columns too.
 * Styled only with canonical classes from globals.css.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  type RegisterRow,
  RTW_LIMIT_LABELS,
  PROBATION_STATUS_LABELS,
  WORKING_STATUS_LABELS,
} from "@/lib/people/types";
import { formatDisplayDate, supervisionSlots, dateRag } from "@/lib/people/logic";
import { setEmploymentStatus, updateTracker } from "@/lib/people/actions";

type Tone = "green" | "amber" | "red" | "neutral";

function toneClass(t: Tone): string {
  return t === "green" ? "pill-green" : t === "amber" ? "pill-amber" : t === "red" ? "pill-red" : "pill-neutral";
}

function workingTone(v: string | null): Tone {
  if (v === "active") return "green";
  if (v === "mat_leave" || v === "lts") return "amber";
  if (v === "leaver") return "red";
  return "neutral";
}
function rtwTone(v: string | null): Tone {
  if (v === "none") return "green";
  if (v === "20hrs_term" || v === "20hrs_2nd_job") return "amber";
  if (v === "visa_expires") return "red";
  return "neutral";
}
function probationTone(v: string | null, dueDate: string | null, amberDays: number): Tone {
  if (v === "passed") return "green";
  if (v === "extended") return "amber";
  if (v === "failed") return "red";
  if (v === "due") {
    // Colourless until the end-due date is within range, then amber, then red.
    const r = dateRag(dueDate, amberDays);
    return r === "red" ? "red" : r === "amber" ? "amber" : "neutral";
  }
  return "neutral";
}

/**
 * A pill that opens into pill options. The cell shows the current value as a
 * coloured pill; clicking opens a menu (rendered in a portal so the table's scroll
 * area does not clip it) of coloured pill options; choosing one saves inline.
 */
function PillSelect({
  personId,
  field,
  value,
  options,
  action,
  toneOf,
}: {
  personId: string;
  field: string;
  value: string | null;
  options: Array<{ value: string; label: string }>;
  action: (formData: FormData) => Promise<void>;
  toneOf: (value: string | null) => Tone;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentLabel = options.find((o) => o.value === (value ?? ""))?.label ?? "—";

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
    setOpen(true);
  }

  function choose(v: string) {
    setOpen(false);
    if (v === (value ?? "")) return;
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set(field, v);
    startTransition(async () => {
      await action(fd);
      router.refresh();
    });
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={pending}
        onClick={toggle}
        className={`${toneClass(toneOf(value))} cursor-pointer`}
      >
        {currentLabel}
        <span aria-hidden className="ml-1 opacity-60">▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: coords.top, left: coords.left, minWidth: Math.max(coords.width, 140) }}
            className="z-50 flex flex-col items-start gap-1 rounded-xl border border-white/15 bg-navy-900 p-2 shadow-2xl"
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => choose(o.value)}
                className={`${toneClass(toneOf(o.value))} cursor-pointer`}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

const WORKING_STATUS_OPTIONS = (Object.keys(WORKING_STATUS_LABELS) as Array<keyof typeof WORKING_STATUS_LABELS>).map(
  (k) => ({ value: k, label: WORKING_STATUS_LABELS[k] }),
);
const RTW_LIMIT_OPTIONS = [
  { value: "", label: "—" },
  ...(Object.keys(RTW_LIMIT_LABELS) as Array<keyof typeof RTW_LIMIT_LABELS>).map((k) => ({
    value: k,
    label: RTW_LIMIT_LABELS[k],
  })),
];
const PROBATION_STATUS_OPTIONS = [
  { value: "", label: "—" },
  ...(Object.keys(PROBATION_STATUS_LABELS) as Array<keyof typeof PROBATION_STATUS_LABELS>).map((k) => ({
    value: k,
    label: PROBATION_STATUS_LABELS[k],
  })),
];

type MatrixConfig = {
  supInterval: number;
  supAmber: number;
  rtwAmber: number;
  probationAmber: number;
};

const RAG_ORDER: Record<string, number> = { red: 0, amber: 1, green: 2, none: 3 };

function ragClass(rag: string): string {
  return rag === "red"
    ? "rag-cell-red"
    : rag === "amber"
      ? "rag-cell-amber"
      : rag === "green"
        ? "rag-cell-green"
        : "rag-cell-none";
}

function RagDate({ date, rag }: { date: string | null; rag: string }) {
  if (!date) return <span className="rag-cell rag-cell-none">—</span>;
  return <span className={`rag-cell ${ragClass(rag)}`}>{formatDisplayDate(date)}</span>;
}

function Plain({ date }: { date: string | null }) {
  return <span className="text-white/70">{date ? formatDisplayDate(date) : "—"}</span>;
}

function WorkingStatusPill({ status }: { status: string }) {
  const label = WORKING_STATUS_LABELS[status as keyof typeof WORKING_STATUS_LABELS] ?? status;
  return <span className={toneClass(workingTone(status))}>{label}</span>;
}

/**
 * A permanent, always-visible horizontal scrollbar we render ourselves and sync to
 * the table's scroll container, because native scrollbars are hidden by macOS/Edge
 * overlay settings. Draggable thumb + click-to-jump track.
 */
function HorizontalScrollbar({ targetRef }: { targetRef: React.RefObject<HTMLDivElement | null> }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startLeft: number } | null>(null);
  const [thumb, setThumb] = useState({ width: 0, left: 0, visible: false });

  const update = useCallback(() => {
    const el = targetRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    if (scrollWidth <= clientWidth + 1) {
      setThumb((t) => (t.visible ? { width: 0, left: 0, visible: false } : t));
      return;
    }
    const trackW = track.clientWidth;
    const width = Math.max(40, (clientWidth / scrollWidth) * trackW);
    const maxScroll = scrollWidth - clientWidth;
    const left = maxScroll > 0 ? (scrollLeft / maxScroll) * (trackW - width) : 0;
    setThumb({ width, left, visible: true });
  }, [targetRef]);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [update, targetRef]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const el = targetRef.current;
      const track = trackRef.current;
      if (!dragRef.current || !el || !track) return;
      const trackW = track.clientWidth;
      const thumbW = Math.max(40, (el.clientWidth / el.scrollWidth) * trackW);
      const maxScroll = el.scrollWidth - el.clientWidth;
      const span = trackW - thumbW;
      const ratio = span > 0 ? (e.clientX - dragRef.current.startX) / span : 0;
      el.scrollLeft = Math.min(maxScroll, Math.max(0, dragRef.current.startLeft + ratio * maxScroll));
    }
    function onUp() {
      dragRef.current = null;
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [targetRef]);

  return (
    <div
      ref={trackRef}
      className="relative h-3.5 w-full shrink-0 rounded-full bg-white/10"
      style={{ visibility: thumb.visible ? "visible" : "hidden" }}
      onPointerDown={(e) => {
        const el = targetRef.current;
        const track = trackRef.current;
        if (!el || !track || e.target !== track) return;
        const rect = track.getBoundingClientRect();
        const maxScroll = el.scrollWidth - el.clientWidth;
        el.scrollLeft = ((e.clientX - rect.left) / rect.width) * maxScroll;
      }}
    >
      <div
        className="absolute top-0 h-3.5 cursor-grab rounded-full bg-white/40 hover:bg-white/60 active:cursor-grabbing"
        style={{ width: `${thumb.width}px`, transform: `translateX(${thumb.left}px)` }}
        onPointerDown={(e) => {
          const el = targetRef.current;
          if (!el) return;
          dragRef.current = { startX: e.clientX, startLeft: el.scrollLeft };
          document.body.style.userSelect = "none";
        }}
      />
    </div>
  );
}

export default function RegisterMatrix({
  rows,
  config,
  editable,
  columnLabels,
}: {
  rows: RegisterRow[];
  config: MatrixConfig;
  editable: boolean;
  columnLabels: Record<string, string>;
}) {
  const [search, setSearch] = useState("");
  const [worstFirst, setWorstFirst] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const col = (key: string, def: string) => columnLabels[key] || def;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = rows;
    if (term) {
      list = rows.filter(
        (r) =>
          r.person.full_name.toLowerCase().includes(term) ||
          (r.person.job_title ?? "").toLowerCase().includes(term) ||
          (r.person.team ?? "").toLowerCase().includes(term),
      );
    }
    if (worstFirst) {
      list = [...list].sort(
        (a, b) =>
          (RAG_ORDER[a.rollup?.rag ?? "none"] ?? 3) - (RAG_ORDER[b.rollup?.rag ?? "none"] ?? 3),
      );
    }
    return list;
  }, [rows, search, worstFirst]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          aria-label="Search people"
        />
        <button
          type="button"
          className={worstFirst ? "btn-primary" : "btn-outline"}
          onClick={() => setWorstFirst((v) => !v)}
        >
          {worstFirst ? "Sorted by status" : "Sort by status"}
        </button>
        <span className="ml-auto text-xs text-white/50">
          {filtered.length} {filtered.length === 1 ? "record" : "records"}
        </span>
      </div>

      <div ref={wrapRef} className="matrix-wrap min-h-0 flex-1">
        <table className="matrix">
          <thead>
            <tr>
              <th className="col-carer">Carer</th>
              <th>{col("status", "Status")}</th>
              <th>{col("start_date", "Start date")}</th>
              <th>{col("manual_handling", "Manual Handling")}</th>
              <th>{col("medication_competency", "Medication Competency")}</th>
              <th>{col("dbs", "DBS")}</th>
              <th>{col("enhanced_dbs", "Enhanced DBS")}</th>
              <th>{col("rtw_expiry", "RTW Expiry")}</th>
              <th>{col("rtw_limits", "RTW Limits")}</th>
              <th>{col("probation_end_due", "Probation End Due")}</th>
              <th>{col("probation_end_actual", "Probation End Actual")}</th>
              <th>{col("probation_status", "Probation Status")}</th>
              <th>{col("probation_extension", "Probation Extension")}</th>
              <th>{col("spot_check_due", "Spot Check Due")}</th>
              <th>{col("recent_spot_check", "Recent Spot Check")}</th>
              <th>{col("sup1_due", "Sup 1 Due")}</th>
              <th>{col("sup1_comp", "Sup 1 Comp")}</th>
              <th>{col("sup2_due", "Sup 2 Due")}</th>
              <th>{col("sup2_comp", "Sup 2 Comp")}</th>
              <th>{col("sup3_due", "Sup 3 Due")}</th>
              <th>{col("sup3_comp", "Sup 3 Comp")}</th>
              <th>{col("aa_due", "AA Next Due")}</th>
              <th>{col("aa_comp", "AA Comp")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const t = row.tracker;
              const mh = row.statusByKey["manual_handling"];
              const mc = row.statusByKey["competency"];
              const sc = row.statusByKey["spot_check"];
              const aa = row.statusByKey["appraisal"];
              const sup = supervisionSlots(
                config.supInterval,
                row.supComps,
                config.supAmber,
                row.statusByKey["appraisal"]?.last_completed_on ?? null,
                t?.probation_end_actual ?? null,
              );
              return (
                <tr key={row.person.id}>
                  <td className="col-carer">
                    <Link href={`/people/${row.person.id}`} className="font-semibold text-white hover:text-gold-300">
                      {row.person.full_name}
                    </Link>
                  </td>
                  <td>
                    {editable ? (
                      <PillSelect
                        personId={row.person.id}
                        field="status"
                        value={row.person.employment_status}
                        options={WORKING_STATUS_OPTIONS}
                        action={setEmploymentStatus}
                        toneOf={workingTone}
                      />
                    ) : (
                      <WorkingStatusPill status={row.person.employment_status} />
                    )}
                  </td>
                  <td><Plain date={row.person.start_date} /></td>
                  <td><RagDate date={mh?.due_date ?? null} rag={mh?.rag ?? "none"} /></td>
                  <td><RagDate date={mc?.due_date ?? null} rag={mc?.rag ?? "none"} /></td>
                  <td><Plain date={t?.dbs_date ?? null} /></td>
                  <td><Plain date={t?.enhanced_dbs_date ?? null} /></td>
                  <td>
                    <RagDate
                      date={t?.rtw_expiry_date ?? null}
                      rag={dateRag(t?.rtw_expiry_date ?? null, config.rtwAmber)}
                    />
                  </td>
                  <td className="text-white/70">
                    {editable ? (
                      <PillSelect
                        personId={row.person.id}
                        field="rtw_limits"
                        value={t?.rtw_limits ?? ""}
                        options={RTW_LIMIT_OPTIONS}
                        action={updateTracker}
                        toneOf={rtwTone}
                      />
                    ) : t?.rtw_limits ? (
                      RTW_LIMIT_LABELS[t.rtw_limits]
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <RagDate
                      date={t?.probation_end_due ?? null}
                      rag={dateRag(t?.probation_end_due ?? null, config.probationAmber)}
                    />
                  </td>
                  <td><Plain date={t?.probation_end_actual ?? null} /></td>
                  <td className="text-white/70">
                    {editable ? (
                      <PillSelect
                        personId={row.person.id}
                        field="probation_status"
                        value={t?.probation_status ?? ""}
                        options={PROBATION_STATUS_OPTIONS}
                        action={updateTracker}
                        toneOf={(v) => probationTone(v, t?.probation_end_due ?? null, config.probationAmber)}
                      />
                    ) : t?.probation_status ? (
                      PROBATION_STATUS_LABELS[t.probation_status]
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <RagDate
                      date={t?.probation_extension_date ?? null}
                      rag={dateRag(t?.probation_extension_date ?? null, config.probationAmber)}
                    />
                  </td>
                  <td><RagDate date={sc?.due_date ?? null} rag={sc?.rag ?? "none"} /></td>
                  <td><Plain date={sc?.last_completed_on ?? null} /></td>
                  <td><RagDate date={sup[0].due} rag={sup[0].rag} /></td>
                  <td><Plain date={sup[0].comp} /></td>
                  <td><RagDate date={sup[1].due} rag={sup[1].rag} /></td>
                  <td><Plain date={sup[1].comp} /></td>
                  <td><RagDate date={sup[2].due} rag={sup[2].rag} /></td>
                  <td><Plain date={sup[2].comp} /></td>
                  <td><RagDate date={aa?.due_date ?? null} rag={aa?.rag ?? "none"} /></td>
                  <td><Plain date={aa?.last_completed_on ?? null} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <HorizontalScrollbar targetRef={wrapRef} />
    </div>
  );
}
