import "server-only";

/**
 * Be Care Compliant — bulk import parsing + validation (no writes).
 * Parses the uploaded CSV against the shared column plan, resolves branches,
 * parses dates (DD/MM/YYYY or YYYY-MM-DD), and flags duplicates so the preview can
 * show exactly what will happen before anything is committed.
 */

import { createClient } from "@/lib/supabase/server";
import { buildColumnPlan, type ColumnPlan } from "./columns";

const RTW_LIMITS = new Set(["none", "20hrs_term", "20hrs_2nd_job", "visa_expires"]);
const PROBATION_STATUS = new Set(["passed", "failed", "extended", "due"]);

export type ParsedRow = {
  row: number;
  name: string;
  branchName: string;
  branchId: string | null;
  fields: Record<string, string | null>;
  docs: Record<string, string | null>;
  checks: Array<{ definitionId: string; name: string; dates: string[] }>;
  status: "new" | "duplicate" | "error";
  errors: string[];
};

export type ValidateResult =
  | { ok: false; error: string }
  | {
      ok: true;
      population: "people" | "service_users";
      rows: ParsedRow[];
      counts: { new: number; duplicate: number; error: number };
    };

/** Minimal RFC4180-ish CSV parser (quotes, embedded commas/newlines). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // handled by \n
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "" -> null (blank), a valid date -> ISO, anything else -> "INVALID". */
function toIso(raw: string): string | null | "INVALID" {
  const s = raw.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let y: number, mo: number, d: number;
  if (m) {
    y = +m[1];
    mo = +m[2];
    d = +m[3];
  } else {
    m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
    if (!m) return "INVALID";
    d = +m[1];
    mo = +m[2];
    y = +m[3];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "INVALID";
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return "INVALID";
  }
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export async function validateImport(
  companyId: string,
  population: "people" | "service_users",
  csvText: string,
): Promise<ValidateResult> {
  const plan: ColumnPlan = await buildColumnPlan(companyId, population);
  const grid = parseCsv(csvText).filter((r) => r.some((c) => c.trim() !== ""));
  if (grid.length === 0) return { ok: false, error: "That file has no rows." };

  const header = grid[0].map((h) => h.trim());
  const colIndex = new Map<string, number>();
  header.forEach((h, i) => {
    if (!colIndex.has(h)) colIndex.set(h, i);
  });

  // Required identity columns must be present.
  for (const f of plan.identity) {
    if (f.required && !colIndex.has(f.header)) {
      return {
        ok: false,
        error: `The file is missing the required column "${f.header}". Use the downloaded template.`,
      };
    }
  }

  const supabase = await createClient();
  const [{ data: branches }, existing] = await Promise.all([
    supabase.from("branches").select("id, name").eq("company_id", companyId).eq("status", "active"),
    loadExisting(companyId, population),
  ]);
  const branchByName = new Map<string, string>();
  for (const b of (branches as Array<{ id: string; name: string }> | null) ?? []) {
    branchByName.set(b.name.trim().toLowerCase(), b.id);
  }

  const cell = (cols: string[], headerName: string): string => {
    const idx = colIndex.get(headerName);
    return idx == null ? "" : (cols[idx] ?? "").trim();
  };

  const rows: ParsedRow[] = [];
  const counts = { new: 0, duplicate: 0, error: 0 };
  const seenKeys = new Set<string>();

  for (let r = 1; r < grid.length; r++) {
    const cols = grid[r];
    const errors: string[] = [];

    const name = cell(cols, "Full name*");
    if (!name) errors.push("Full name is required.");

    const branchName = cell(cols, "Branch*");
    let branchId: string | null = null;
    if (!branchName) errors.push("Branch is required.");
    else {
      branchId = branchByName.get(branchName.toLowerCase()) ?? null;
      if (!branchId) errors.push(`Branch "${branchName}" does not match a branch in this company.`);
    }

    // Identity + document date/text fields.
    const fields: Record<string, string | null> = {};
    for (const f of plan.identity) {
      if (f.kind === "branch") continue;
      const raw = cell(cols, f.header);
      if (f.kind === "date") {
        const iso = toIso(raw);
        if (iso === "INVALID") errors.push(`${f.header} is not a valid date (use DD/MM/YYYY).`);
        else fields[f.field] = iso;
      } else fields[f.field] = raw || null;
    }

    const docs: Record<string, string | null> = {};
    for (const d of plan.documents) {
      const raw = cell(cols, d.header);
      if (!raw) {
        docs[d.column] = null;
        continue;
      }
      if (d.kind === "date") {
        const iso = toIso(raw);
        if (iso === "INVALID") errors.push(`${d.header} is not a valid date (use DD/MM/YYYY).`);
        else docs[d.column] = iso;
      } else if (d.column === "rtw_limits") {
        docs[d.column] = RTW_LIMITS.has(raw) ? raw : null;
      } else if (d.column === "probation_status") {
        docs[d.column] = PROBATION_STATUS.has(raw) ? raw : null;
      } else docs[d.column] = raw;
    }

    // Check completion dates: parse each column, keep valid dates newest-first.
    const checks: ParsedRow["checks"] = [];
    for (const c of plan.checks) {
      const dates: string[] = [];
      for (const h of c.headers) {
        const iso = toIso(cell(cols, h));
        if (iso === "INVALID") errors.push(`${h} is not a valid date (use DD/MM/YYYY).`);
        else if (iso) dates.push(iso);
      }
      const unique = Array.from(new Set(dates)).sort((a, b) => (a < b ? 1 : -1));
      if (unique.length > 0) checks.push({ definitionId: c.definitionId, name: c.name, dates: unique });
    }

    // Duplicate detection: within the file and against existing records.
    let status: ParsedRow["status"] = "new";
    if (errors.length > 0) status = "error";
    else {
      const emailKey = fields.work_email ? `e:${fields.work_email.toLowerCase()}` : null;
      const nameKey = branchId ? `n:${name.toLowerCase()}|${branchId}` : null;
      const dup =
        (emailKey && (existing.has(emailKey) || seenKeys.has(emailKey))) ||
        (nameKey && (existing.has(nameKey) || seenKeys.has(nameKey)));
      if (dup) status = "duplicate";
      else {
        if (emailKey) seenKeys.add(emailKey);
        if (nameKey) seenKeys.add(nameKey);
      }
    }
    counts[status] += 1;

    rows.push({ row: r + 1, name, branchName, branchId, fields, docs, checks, status, errors });
  }

  return { ok: true, population, rows, counts };
}

/** Existing record keys for dedupe: e:<email> and n:<name>|<branch_id>. */
async function loadExisting(
  companyId: string,
  population: "people" | "service_users",
): Promise<Set<string>> {
  const supabase = await createClient();
  const keys = new Set<string>();
  if (population === "people") {
    const { data } = await supabase
      .from("people")
      .select("full_name, work_email, branch_id")
      .eq("company_id", companyId)
      .is("archived_at", null);
    for (const p of (data as Array<{ full_name: string; work_email: string | null; branch_id: string | null }> | null) ?? []) {
      if (p.work_email) keys.add(`e:${p.work_email.toLowerCase()}`);
      if (p.branch_id) keys.add(`n:${p.full_name.toLowerCase()}|${p.branch_id}`);
    }
  } else {
    const { data } = await supabase
      .from("service_users")
      .select("full_name, branch_id")
      .eq("company_id", companyId)
      .is("archived_at", null);
    for (const s of (data as Array<{ full_name: string; branch_id: string | null }> | null) ?? []) {
      if (s.branch_id) keys.add(`n:${s.full_name.toLowerCase()}|${s.branch_id}`);
    }
  }
  return keys;
}
