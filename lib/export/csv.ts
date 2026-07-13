import "server-only";

/**
 * Be Care Compliant — the ONE CSV helper (Phase 8).
 *
 * Every CSV export in the app is built here. Never assemble CSV by hand with
 * string concatenation anywhere else: escaping is easy to get wrong (commas,
 * quotes, newlines, leading = + - @ that spreadsheets treat as formulae) and a
 * single shared helper keeps every export safe and identical.
 *
 * RFC 4180 quoting, CRLF line endings, and a UTF-8 BOM so Excel opens accented
 * names correctly. No dashes in any header text (customer-facing copy rule).
 */

export type CsvCell = string | number | null | undefined;

/** A leading =, +, - or @ can be interpreted as a formula by Excel, so neutralise it. */
function deFormula(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  let s = typeof cell === "number" ? String(cell) : cell;
  s = deFormula(s);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV document from a header row and data rows.
 * Returns a UTF-8 string beginning with a BOM.
 */
export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCell).join(","));
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  // ﻿ = UTF-8 BOM so Excel reads accented characters correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** UTF-8 bytes of a CSV document, for a Storage upload or a download Response. */
export function csvToBuffer(csv: string): Buffer {
  return Buffer.from(csv, "utf-8");
}
