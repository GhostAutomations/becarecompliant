"use client";

/**
 * Be Care Compliant: the carer's phone storage for clock in and out (Rota and Visits Stage 3,
 * offline design sections 1 to 3). IndexedDB, so it survives the app being closed and works with
 * no signal. Two stores:
 *
 *   outbox  each tap waiting to be sent, keyed by its event id (the server keeps each id once)
 *   day     the carer's own visits and shifts, kept per sign in, for opening with no signal
 *
 * Nothing here decides anything: lib/rota/clock.ts holds the rules, so they are unit tested.
 */

import type { ClockEvent } from "@/lib/rota/clock";
import type { RecordedOutcome, TaskEvent, TaskItem } from "@/lib/rota/tasks";
import type { NoteEvent, VisitNotes } from "@/lib/rota/notes";

const DB = "bcc-rota";
// 2: task outcomes (Stage 4) get their own outbox beside the clock taps.
// 3: care notes and concerns (Stage 5) get theirs.
const VERSION = 3;

export type VisitTasks = { visit_id: string; list_id: string; tasks: TaskItem[]; outcomes: Record<string, RecordedOutcome> };

export type DayRow = {
  target_kind: "visit" | "shift";
  target_id: string;
  branch_id: string;
  starts_at: string;
  ends_at: string;
  title: string;
  address: string | null;
  place_lat: number | null;
  place_lng: number | null;
  radius_m: number;
  paused: boolean;
  clocked_in_at: string | null;
  clocked_out_at: string | null;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "event_id" });
      if (!db.objectStoreNames.contains("day")) db.createObjectStore("day", { keyPath: "owner" });
      if (!db.objectStoreNames.contains("task_outbox")) db.createObjectStore("task_outbox", { keyPath: "event_id" });
      if (!db.objectStoreNames.contains("note_outbox")) db.createObjectStore("note_outbox", { keyPath: "event_id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      let value: T | undefined;
      if (req) req.onsuccess = () => (value = req.result);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function addEvent(e: ClockEvent): Promise<void> {
  await run("outbox", "readwrite", (s) => s.put(e));
}

export async function allEvents(): Promise<ClockEvent[]> {
  return ((await run<ClockEvent[]>("outbox", "readonly", (s) => s.getAll() as IDBRequest<ClockEvent[]>)) ?? []) as ClockEvent[];
}

export async function removeEvents(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await run("outbox", "readwrite", (s) => {
    for (const id of ids) s.delete(id);
  });
}

export async function markRefused(refused: { event_id: string; reason: string }[]): Promise<void> {
  if (!refused.length) return;
  const all = await allEvents();
  const byId = new Map(all.map((e) => [e.event_id, e]));
  await run("outbox", "readwrite", (s) => {
    for (const r of refused) {
      const e = byId.get(r.event_id);
      if (e) s.put({ ...e, refused: r.reason });
    }
  });
}

/** Removes a refused tap the carer has seen (the office has its own copy). */
export async function dismissEvent(id: string): Promise<void> {
  await removeEvents([id]);
}

export async function saveDay(owner: string, rows: DayRow[], tasks: VisitTasks[] = [], notes: VisitNotes[] = []): Promise<void> {
  await run("day", "readwrite", (s) => s.put({ owner, rows, tasks, notes, saved_at: new Date().toISOString() }));
}

export async function loadDay(owner: string): Promise<{ rows: DayRow[]; tasks: VisitTasks[]; notes: VisitNotes[]; saved_at: string } | null> {
  const v = (await run<{ owner: string; rows: DayRow[]; tasks?: VisitTasks[]; notes?: VisitNotes[]; saved_at: string }>("day", "readonly", (s) => s.get(owner))) ?? null;
  return v ? { rows: v.rows, tasks: v.tasks ?? [], notes: v.notes ?? [], saved_at: v.saved_at } : null;
}

/* Task outcomes waiting to be sent (Stage 4): the same rules as the clock taps. */
export async function addTaskEvent(e: TaskEvent): Promise<void> {
  await run("task_outbox", "readwrite", (s) => s.put(e));
}

export async function allTaskEvents(): Promise<TaskEvent[]> {
  return ((await run<TaskEvent[]>("task_outbox", "readonly", (s) => s.getAll() as IDBRequest<TaskEvent[]>)) ?? []) as TaskEvent[];
}

export async function removeTaskEvents(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await run("task_outbox", "readwrite", (s) => {
    for (const id of ids) s.delete(id);
  });
}

export async function markTasksRefused(refused: { event_id: string; reason: string }[]): Promise<void> {
  if (!refused.length) return;
  const byId = new Map((await allTaskEvents()).map((e) => [e.event_id, e]));
  await run("task_outbox", "readwrite", (s) => {
    for (const r of refused) {
      const e = byId.get(r.event_id);
      if (e) s.put({ ...e, refused: r.reason });
    }
  });
}

/* Care notes and concerns waiting to be sent (Stage 5): the same rules again. */
export async function addNoteEvent(e: NoteEvent): Promise<void> {
  await run("note_outbox", "readwrite", (s) => s.put(e));
}

export async function allNoteEvents(): Promise<NoteEvent[]> {
  return ((await run<NoteEvent[]>("note_outbox", "readonly", (s) => s.getAll() as IDBRequest<NoteEvent[]>)) ?? []) as NoteEvent[];
}

export async function removeNoteEvents(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await run("note_outbox", "readwrite", (s) => {
    for (const id of ids) s.delete(id);
  });
}

export async function markNotesRefused(refused: { event_id: string; reason: string }[]): Promise<void> {
  if (!refused.length) return;
  const byId = new Map((await allNoteEvents()).map((e) => [e.event_id, e]));
  await run("note_outbox", "readwrite", (s) => {
    for (const r of refused) {
      const e = byId.get(r.event_id);
      if (e) s.put({ ...e, refused: r.reason });
    }
  });
}

/** Another carer's kept day is removed once they have nothing waiting (offline design, 7). */
export async function clearOtherDays(owner: string): Promise<void> {
  const waiting = new Set([...(await allEvents()), ...(await allTaskEvents()), ...(await allNoteEvents())].map((e) => e.owner));
  const keys = ((await run<IDBValidKey[]>("day", "readonly", (s) => s.getAllKeys())) ?? []) as string[];
  const drop = keys.filter((k) => k !== owner && !waiting.has(k));
  if (!drop.length) return;
  await run("day", "readwrite", (s) => {
    for (const k of drop) s.delete(k);
  });
}

/** A stable id for this phone, and a running number per tap (keeps order when clocks disagree). */
export function deviceId(): string {
  try {
    let id = localStorage.getItem("bcc-device-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("bcc-device-id", id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

export function nextSeq(): number {
  try {
    const n = Number(localStorage.getItem("bcc-device-seq") ?? "0") + 1;
    localStorage.setItem("bcc-device-seq", String(n));
    return n;
  } catch {
    return Date.now();
  }
}
