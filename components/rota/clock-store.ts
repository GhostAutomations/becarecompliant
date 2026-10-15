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

const DB = "bcc-rota";
const VERSION = 1;

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

export async function saveDay(owner: string, rows: DayRow[]): Promise<void> {
  await run("day", "readwrite", (s) => s.put({ owner, rows, saved_at: new Date().toISOString() }));
}

export async function loadDay(owner: string): Promise<{ rows: DayRow[]; saved_at: string } | null> {
  const v = (await run<{ owner: string; rows: DayRow[]; saved_at: string }>("day", "readonly", (s) => s.get(owner))) ?? null;
  return v ? { rows: v.rows, saved_at: v.saved_at } : null;
}

/** Another carer's kept day is removed once they have nothing waiting (offline design, 7). */
export async function clearOtherDays(owner: string): Promise<void> {
  const waiting = new Set((await allEvents()).map((e) => e.owner));
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
