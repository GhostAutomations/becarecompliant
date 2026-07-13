import "server-only";

/**
 * Be Care Compliant — export delivery helpers (Phase 8).
 * Turn a rendered PDF buffer or a CSV string into a download Response. Content is
 * served as an attachment so the browser saves it with a sensible name. These are
 * the only place export bytes become an HTTP body.
 */

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function pdfResponse(bytes: Buffer, base: string): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${base}-${stamp()}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

export function csvResponse(csv: string, base: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}-${stamp()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

export function exportError(message: string, status = 400): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
