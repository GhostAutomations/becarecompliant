/**
 * Every view the app reads must read as the CALLER, so RLS still decides who sees what.
 *
 * WHY THIS TEST EXISTS (DEF-073, 2026-09-24): person_absence_summary was created with
 * security_invoker in 0041, then redefined in 0223 with a plain "create or replace view ... as".
 * Postgres drops the option when a view is replaced without it, so for three weeks the view ran
 * as its owner, ignored RLS, and anyone holding the publishable key could read every company's
 * absence counts. Nothing failed and nothing looked wrong, which is why it needs a test.
 *
 * This reads every migration in order, keeps the LAST definition of each public view, and fails
 * if that definition does not carry security_invoker, unless a later migration sets it with
 * "alter view ... set (security_invoker ...)".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const DIR = new URL("../../supabase/migrations/", import.meta.url);

test("the latest definition of every public view reads as the caller", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const invoker = new Map<string, { file: string; ok: boolean }>();
  const createRe = /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?"?([a-z0-9_]+)"?\s*([\s\S]*?)\bas\b/gi;
  const alterRe = /alter\s+view\s+(?:public\.)?"?([a-z0-9_]+)"?\s+set\s*\(\s*security_invoker\s*=\s*(on|true)\s*\)/gi;
  const dropRe = /drop\s+view\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi;
  for (const file of files) {
    // Comments can mention views in passing; only statements count.
    const sql = readFileSync(new URL(file, DIR), "utf8").replace(/--[^\n]*/g, "");
    type Ev = { at: number; run: () => void };
    const events: Ev[] = [];
    for (const m of sql.matchAll(createRe)) {
      const name = m[1].toLowerCase();
      const ok = /security_invoker\s*=\s*(on|true)/i.test(m[2]);
      events.push({ at: m.index ?? 0, run: () => invoker.set(name, { file, ok }) });
    }
    for (const m of sql.matchAll(alterRe)) {
      const name = m[1].toLowerCase();
      events.push({ at: m.index ?? 0, run: () => invoker.set(name, { file, ok: true }) });
    }
    for (const m of sql.matchAll(dropRe)) {
      const name = m[1].toLowerCase();
      events.push({ at: m.index ?? 0, run: () => invoker.delete(name) });
    }
    events.sort((a, b) => a.at - b.at).forEach((e) => e.run());
  }
  const bad = [...invoker.entries()].filter(([, v]) => !v.ok).map(([k, v]) => `${k} (${v.file})`);
  assert.deepEqual(bad, [], `These views run as their owner and skip RLS: ${bad.join(", ")}`);
  assert.ok(invoker.has("person_absence_summary"), "the scan no longer finds person_absence_summary");
});
