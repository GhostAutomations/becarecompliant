"use client";

/**
 * Be Care Compliant: the carer's Clock in and Clock out screen (Rota and Visits Stage 3, Phil
 * 2026-10-16; docs/project/rota-offline-design.md).
 *
 * Built to work with no signal:
 *  - The day (their own visits and shifts, each place's map point and radius) is fetched when
 *    there is signal and kept on the phone; with no signal the kept copy is shown.
 *  - A tap is saved on the phone first ("Saved on this phone"), then sent. Nothing waits for
 *    signal and care is never blocked.
 *  - Sending happens on opening, on coming back to the front, when signal returns and every 30
 *    seconds while open. The server keeps each tap once; a refused tap stays here with the reason.
 *  - Only the person signed in when a tap was made can send it.
 *
 * The position is read at the tap only. Nothing tracks the carer between taps.
 *
 * A scanned QR code or NFC sticker opens /c/<code>, which comes here; the code proves the carer
 * was at the place, whatever the GPS says.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CentreDialog } from "@/components/panel-dialog";
import {
  OUTSIDE_REASONS,
  applyResults,
  clockOpen,
  clockOutcome,
  clockState,
  codeFromPath,
  minutesUntilOpen,
  nextBatch,
  type ClockEvent,
  type Fix,
  type ReasonCode,
  type SubmitResult,
} from "@/lib/rota/clock";
import { keyTasksWithoutOutcome, mergeOutcomes, type TaskEvent, type TaskItem, type TaskOutcomeKind, type TaskReasonCode } from "@/lib/rota/tasks";
import VisitTaskList from "@/components/rota/clock-tasks";
import {
  addEvent,
  addTaskEvent,
  allEvents,
  allTaskEvents,
  clearOtherDays,
  deviceId,
  dismissEvent,
  loadDay,
  markRefused,
  markTasksRefused,
  nextSeq,
  removeEvents,
  removeTaskEvents,
  saveDay,
  type DayRow,
  type VisitTasks,
} from "@/components/rota/clock-store";

const SEND_EVERY_MS = 30_000;

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
function dayWord(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
}

/** The phone's position at the tap, or null (refused, switched off, or no fix in 20 seconds). */
function readPosition(): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

type Pending = { row: DayRow; kind: "in" | "out"; fix: Fix | null; metres: number | null; method: "gps" | "qr" | "nfc"; token: string | null };

export default function ClockApp({ ownerId }: { ownerId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [queue, setQueue] = useState<ClockEvent[]>([]);
  const [online, setOnline] = useState(true);
  const [sessionOk, setSessionOk] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [ask, setAsk] = useState<Pending | null>(null);
  const [reason, setReason] = useState<ReasonCode | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [code, setCode] = useState<{ token: string; via: "qr" | "nfc" } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [codeTargetId, setCodeTargetId] = useState<string | null>(null);
  const [visitTasks, setVisitTasks] = useState<VisitTasks[]>([]);
  const [taskQueue, setTaskQueue] = useState<TaskEvent[]>([]);
  const [gate, setGate] = useState<{ row: DayRow; viaCode: { token: string; via: "qr" | "nfc" } | null } | null>(null);
  const sending = useRef(false);

  const refreshQueue = useCallback(async () => {
    setQueue(await allEvents());
    setTaskQueue(await allTaskEvents().catch(() => []));
  }, []);

  // The day: the kept copy first (works with no signal), then a fresh one when there is signal.
  const loadTheDay = useCallback(async () => {
    const kept = await loadDay(ownerId).catch(() => null);
    if (kept) {
      setRows((r) => r ?? kept.rows);
      setVisitTasks((v) => (v.length ? v : kept.tasks));
      setSavedAt((s) => s ?? kept.saved_at);
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const [{ data, error }, { data: taskData }] = await Promise.all([supabase.rpc("rota_my_day"), supabase.rpc("rota_my_visit_tasks")]);
    if (error) {
      if (!kept) setRows((r) => r ?? []);
      return;
    }
    const fresh = (data as DayRow[] | null) ?? [];
    const freshTasks = (taskData as VisitTasks[] | null) ?? kept?.tasks ?? [];
    setRows(fresh);
    setVisitTasks(freshTasks);
    const at = new Date().toISOString();
    setSavedAt(at);
    await saveDay(ownerId, fresh, freshTasks).catch(() => undefined);
    await clearOtherDays(ownerId).catch(() => undefined);
  }, [ownerId, supabase]);

  // Send what is waiting. One send at a time; whatever the server does not answer goes again.
  const send = useCallback(async () => {
    if (sending.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    sending.current = true;
    try {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id ?? null;
      setSessionOk(uid === ownerId);
      if (uid !== ownerId) return;
      let batch = nextBatch(await allEvents(), ownerId);
      let sentAny = false;
      while (batch.length) {
        const payload = batch.map(({ owner: _o, refused: _r, ...e }) => e);
        const { data, error } = await supabase.rpc("rota_clock_submit", { p_events: payload, p_phone_now: new Date().toISOString() });
        if (error) break;
        const { remove, refuse } = applyResults((data as SubmitResult[] | null) ?? []);
        await removeEvents(remove);
        await markRefused(refuse);
        sentAny = true;
        if (remove.length + refuse.length === 0) break;
        batch = nextBatch(await allEvents(), ownerId);
      }
      // Task outcomes (Stage 4): the same rules, their own outbox.
      let taskBatch = nextBatch(await allTaskEvents(), ownerId);
      while (taskBatch.length) {
        const payload = taskBatch.map(({ owner: _o, refused: _r, ...e }) => e);
        const { data, error } = await supabase.rpc("rota_task_submit", { p_events: payload, p_phone_now: new Date().toISOString() });
        if (error) break;
        const { remove, refuse } = applyResults((data as SubmitResult[] | null) ?? []);
        await removeTaskEvents(remove);
        await markTasksRefused(refuse);
        sentAny = true;
        if (remove.length + refuse.length === 0) break;
        taskBatch = nextBatch(await allTaskEvents(), ownerId);
      }
      if (sentAny) {
        setLastSent(new Date().toISOString());
        await loadTheDay();
      }
    } finally {
      sending.current = false;
      await refreshQueue();
    }
  }, [ownerId, supabase, loadTheDay, refreshQueue]);

  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const token = codeFromPath(path) ?? (params.get("code") && /^[0-9a-f]{36}$/.test(params.get("code")!) ? params.get("code") : null);
    if (token) {
      setCode({ token, via: params.get("via") === "nfc" ? "nfc" : "qr" });
      // With signal, the server says which of their visits or shifts the code is for.
      if (navigator.onLine) {
        void supabase.rpc("rota_my_target_for_code", { p_token: token }).then(({ data }) => {
          const hit = (data as { target_id: string }[] | null)?.[0];
          if (hit) setCodeTargetId(hit.target_id);
        });
      }
    }

    setOnline(navigator.onLine);
    void refreshQueue();
    // Whose phone is it now? Read from the phone (works with no signal). Another carer's kept day
    // is never shown (offline design, 7).
    void supabase.auth.getSession().then(({ data: s }) => {
      if ((s.session?.user.id ?? null) !== ownerId) {
        setSessionOk(false);
        return;
      }
      void loadTheDay().then(send);
    });

    // The app's screens are kept on the phone so it opens with no signal (offline design, 1).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          const files = performance
            .getEntriesByType("resource")
            .map((e) => e.name)
            .filter((u) => u.startsWith(`${location.origin}/_next/static/`));
          reg.active?.postMessage({ type: "keep", urls: [...files, "/clock"] });
        })
        .catch(() => undefined);
    }
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => undefined);

    const onOnline = () => {
      setOnline(true);
      void loadTheDay().then(send);
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") void send();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void send();
    }, SEND_EVERY_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [loadTheDay, send, refreshQueue, supabase, ownerId]);

  async function save(p: Pending, reasonCode: ReasonCode | null, why: string) {
    const e: ClockEvent = {
      event_id: crypto.randomUUID(),
      owner: ownerId,
      kind: p.kind,
      target_kind: p.row.target_kind,
      target_id: p.row.target_id,
      method: p.method,
      phone_time: new Date().toISOString(),
      lat: p.fix?.lat ?? null,
      lng: p.fix?.lng ?? null,
      accuracy: p.fix?.accuracy ?? null,
      qr_token: p.token,
      reason_code: reasonCode,
      reason_text: reasonCode === "other" ? why.trim().slice(0, 500) : null,
      device_id: deviceId(),
      device_seq: nextSeq(),
    };
    await addEvent(e);
    await refreshQueue();
    setNotice(`${p.kind === "in" ? "Clocked in" : "Clocked out"} at ${hhmm(e.phone_time)}. Saved on this phone${navigator.onLine ? ", sending now." : ". It will send when you have signal."}`);
    if (p.method !== "gps") setCode(null);
    void send();
  }

  const tasksFor = (row: DayRow) => visitTasks.find((v) => v.visit_id === row.target_id) ?? null;
  const outcomesFor = (row: DayRow) => {
    const vt = tasksFor(row);
    return mergeOutcomes(vt?.outcomes ?? {}, taskQueue, row.target_id, ownerId);
  };

  async function recordTask(row: DayRow, task: TaskItem, outcome: TaskOutcomeKind, reasonCode: TaskReasonCode | null, why: string) {
    const vt = tasksFor(row);
    if (!vt || !task.uid) return;
    await addTaskEvent({
      event_id: crypto.randomUUID(),
      owner: ownerId,
      visit_id: row.target_id,
      list_id: vt.list_id,
      task_uid: task.uid,
      outcome,
      reason_code: outcome === "done" ? null : reasonCode,
      reason_text: reasonCode === "other" ? why.trim().slice(0, 500) : null,
      phone_time: new Date().toISOString(),
      device_id: deviceId(),
      device_seq: nextSeq(),
    });
    await refreshQueue();
    void send();
  }

  async function tap(row: DayRow, kind: "in" | "out", viaCode: { token: string; via: "qr" | "nfc" } | null, skipGate = false) {
    setNotice(null);
    // Key tasks first (Phil, 2026-10-16): any outcome counts, so care is never blocked.
    if (kind === "out" && !skipGate && row.target_kind === "visit") {
      const vt = tasksFor(row);
      if (vt && keyTasksWithoutOutcome(vt.tasks, outcomesFor(row)).length) {
        setGate({ row, viaCode });
        return;
      }
    }
    setBusy(`${row.target_id}:${kind}`);
    try {
      const fix = await readPosition();
      const place = row.place_lat != null && row.place_lng != null ? { lat: row.place_lat, lng: row.place_lng, radius: row.radius_m } : null;
      const { outcome, metres } = clockOutcome(fix, place);
      const p: Pending = { row, kind, fix, metres, method: viaCode ? viaCode.via : "gps", token: viaCode?.token ?? null };
      // A code at the door is the proof; outside the radius without one asks for a reason.
      if (!viaCode && outcome === "outside") {
        setReason(null);
        setReasonText("");
        setAsk(p);
        return;
      }
      await save(p, null, "");
    } finally {
      setBusy(null);
    }
  }

  const waiting = queue.filter((e) => e.owner === ownerId && !e.refused);
  const refused = queue.filter((e) => e.owner === ownerId && e.refused);
  const others = queue.filter((e) => e.owner !== ownerId).length;
  const list = rows ?? [];
  const open = list.filter((r) => !r.paused && clockOpen(now, Date.parse(r.starts_at), Date.parse(r.ends_at)));
  // With a scanned code: the visit or shift it is for is the open one still running, else the nearest.
  const codeTarget = code
    ? open.find((r) => r.target_id === codeTargetId) ?? open.find((r) => {
        const st = clockState(r, queue, ownerId);
        return st.inAt && !st.outAt;
      }) ?? [...open].sort((a, b) => Math.abs(Date.parse(a.starts_at) - now) - Math.abs(Date.parse(b.starts_at) - now))[0] ?? null
    : null;

  if (!sessionOk) {
    return (
      <div className="glass-card p-4 text-sm text-amber-200">
        Someone else is signed in on this phone. Clock ins saved here by another carer stay locked on this phone until they sign back in.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-card flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
        <span className={online ? "text-emerald-300" : "text-amber-300"}>{online ? "Signal: connected" : "No signal: taps are saved on this phone"}</span>
        <span className="text-white/50">
          {waiting.length
            ? `${waiting.length} record${waiting.length === 1 ? "" : "s"} waiting to send`
            : lastSent
              ? `Everything sent (${hhmm(lastSent)})`
              : "Nothing waiting to send"}
        </span>
      </div>

      {notice ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200" role="status">
          {notice}
        </p>
      ) : null}

      {refused.length ? (
        <section className="glass-card space-y-2 border-red-500/30 p-4" aria-label="Not accepted">
          <h2 className="text-sm font-semibold text-white">Not accepted ({refused.length})</h2>
          <p className="text-xs text-white/55">The office has been told. Call them if you are not sure what to do.</p>
          {refused.map((e) => (
            <div key={e.event_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
              <span className="text-xs text-white/80">
                {e.kind === "in" ? "Clock in" : "Clock out"} at {hhmm(e.phone_time)}: {e.refused}
              </span>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => dismissEvent(e.event_id).then(refreshQueue)}>
                Remove
              </button>
            </div>
          ))}
        </section>
      ) : null}

      {others ? (
        <p className="text-xs text-white/45">
          {others} record{others === 1 ? "" : "s"} saved here by another carer will send when they sign back in on this phone.
        </p>
      ) : null}

      {code ? (
        <section className="glass-card space-y-3 border-amber-500/40 p-4" aria-label="Code scanned">
          <h2 className="text-sm font-semibold text-white">{code.via === "nfc" ? "Sticker read" : "QR code scanned"}</h2>
          {codeTarget ? (
            (() => {
              const st = clockState(codeTarget, queue, ownerId);
              const kind: "in" | "out" = st.inAt && !st.outAt ? "out" : "in";
              return (
                <>
                  <p className="text-sm text-white/80">
                    {codeTarget.title}, {hhmm(codeTarget.starts_at)} to {hhmm(codeTarget.ends_at)}
                  </p>
                  <button
                    type="button"
                    className="btn-primary w-full px-4 py-3 text-base"
                    disabled={busy !== null}
                    onClick={() => tap(codeTarget, kind, code)}
                  >
                    {busy ? "Saving…" : kind === "in" ? "Clock in" : "Clock out"}
                  </button>
                </>
              );
            })()
          ) : (
            <p className="text-sm text-white/70">You have no visit or shift open right now. Clock in opens 30 minutes before the start.</p>
          )}
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setCode(null)}>
            Not now
          </button>
        </section>
      ) : null}

      {rows === null ? (
        <p className="text-sm text-white/60" role="status">Loading your day…</p>
      ) : list.length === 0 ? (
        <div className="glass-card p-4 text-sm text-white/60">No published visits or shifts for you today or tomorrow.</div>
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const st = clockState(r, queue, ownerId);
            const isOpen = clockOpen(now, Date.parse(r.starts_at), Date.parse(r.ends_at));
            const wait = minutesUntilOpen(now, Date.parse(r.starts_at));
            const kind: "in" | "out" | null = !st.inAt ? "in" : !st.outAt ? "out" : null;
            return (
              <section key={`${r.target_kind}-${r.target_id}`} className={`glass-card space-y-2 p-4 ${r.paused ? "opacity-70" : ""}`} aria-label={r.title}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {dayWord(r.starts_at)}, {hhmm(r.starts_at)} to {hhmm(r.ends_at)}
                    </p>
                    <p className="text-sm text-white/80">{r.title}</p>
                    {r.address ? <p className="text-xs text-white/55">{r.address}</p> : null}
                  </div>
                  <span className="pill pill-neutral">{r.target_kind === "visit" ? "Visit" : "Shift"}</span>
                </div>
                {r.paused ? <span className="pill pill-amber">Paused: do not go</span> : null}
                <p className="text-xs text-white/60">
                  {st.inAt ? `Clocked in ${hhmm(st.inAt)}${st.inWaiting ? " (waiting to send)" : ""}` : "Not clocked in"}
                  {st.outAt ? ` · Clocked out ${hhmm(st.outAt)}${st.outWaiting ? " (waiting to send)" : ""}` : ""}
                </p>
                {r.target_kind === "visit" && !r.paused && isOpen && tasksFor(r)?.tasks.length ? (
                  <details className="rounded-lg border border-white/10 p-2" open={Boolean(st.inAt && !st.outAt)}>
                    <summary className="cursor-pointer text-xs font-semibold text-white/75">Tasks ({tasksFor(r)!.tasks.length})</summary>
                    <div className="mt-2">
                      <VisitTaskList tasks={tasksFor(r)!.tasks} outcomes={outcomesFor(r)} onRecord={(t, o, rc, why) => recordTask(r, t, o, rc, why)} />
                    </div>
                  </details>
                ) : null}
                {!r.paused && kind ? (
                  isOpen ? (
                    <button
                      type="button"
                      className="btn-primary w-full px-4 py-3 text-base"
                      disabled={busy !== null}
                      onClick={() => tap(r, kind, null)}
                    >
                      {busy === `${r.target_id}:${kind}` ? "Finding your position…" : kind === "in" ? "Clock in" : "Clock out"}
                    </button>
                  ) : wait > 0 ? (
                    // Shown as a greyed button, so it is clear where Clock in will be (Phil,
                    // 2026-10-16: tapping the visit before it opened seemed to do nothing).
                    <>
                      <button type="button" className="btn-outline w-full px-4 py-3 text-base" disabled>
                        Clock in opens at {hhmm(new Date(Date.parse(r.starts_at) - 30 * 60_000).toISOString())}
                      </button>
                      <p className="text-xs text-white/45">
                        That is 30 minutes before the start ({wait >= 60 ? `${Math.floor(wait / 60)} h ${wait % 60} min from now` : `${wait} min from now`}).
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-white/45">Clock in has closed. Call the office to add the time.</p>
                  )
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {savedAt && !online ? <p className="text-xs text-white/40">Showing your day as it was at {hhmm(savedAt)}.</p> : null}

      <CentreDialog open={gate !== null} onClose={() => setGate(null)} label="Key tasks first">
        {gate ? (
          (() => {
            const vt = tasksFor(gate.row);
            const outs = outcomesFor(gate.row);
            const missing = vt ? keyTasksWithoutOutcome(vt.tasks, outs) : [];
            return (
              <div className="space-y-3 p-5">
                <p className="text-sm text-white/75">
                  {missing.length
                    ? "Before you clock out, mark each key task: Done, or Not done with a reason."
                    : "All key tasks are marked. You can clock out now."}
                </p>
                {vt ? <VisitTaskList tasks={vt.tasks} outcomes={outs} onlyKey onRecord={(t, o, rc, why) => recordTask(gate.row, t, o, rc, why)} /> : null}
                <button
                  type="button"
                  className="btn-primary w-full px-4 py-3 text-base"
                  disabled={missing.length > 0}
                  onClick={() => {
                    const g = gate;
                    setGate(null);
                    void tap(g.row, "out", g.viaCode, true);
                  }}
                >
                  Clock out
                </button>
              </div>
            );
          })()
        ) : null}
      </CentreDialog>

      <CentreDialog open={ask !== null} onClose={() => setAsk(null)} label="You are not at the home">
        {ask ? (
          <div className="space-y-3 p-5">
            <p className="text-sm text-white/75">
              Your phone puts you {ask.metres != null ? `${ask.metres.toLocaleString("en-GB")} m` : "some way"} from{" "}
              {ask.row.target_kind === "visit" ? "the home" : "the branch"}. You can still {ask.kind === "in" ? "clock in" : "clock out"}: pick a reason and the office will see it.
            </p>
            <div className="space-y-2" role="radiogroup" aria-label="Reason">
              {OUTSIDE_REASONS.map((r) => (
                <label key={r.code} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/85">
                  <input type="radio" name="reason" checked={reason === r.code} onChange={() => setReason(r.code)} />
                  {r.label}
                </label>
              ))}
            </div>
            {reason === "other" ? (
              <textarea rows={2} maxLength={500} value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Type the reason" aria-label="Reason" />
            ) : null}
            <button
              type="button"
              className="btn-primary w-full px-4 py-3 text-base"
              disabled={!reason || (reason === "other" && !reasonText.trim())}
              onClick={async () => {
                const p = ask;
                setAsk(null);
                await save(p, reason, reasonText);
              }}
            >
              {ask.kind === "in" ? "Clock in" : "Clock out"}
            </button>
          </div>
        ) : null}
      </CentreDialog>
    </div>
  );
}
