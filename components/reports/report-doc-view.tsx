import "server-only";

/**
 * Be Care Compliant — on screen renderer for a ReportDoc (Phase 8 View).
 * Renders the SAME ReportDoc the PDF builder uses, as a styled in app page, so
 * the on screen view and the downloadable PDF never diverge. Dark glass theme,
 * RAG pills, scrollable tables. No dashes in copy.
 */

import type { ReportDoc, ReportBlock, ReportCell, RagTone } from "@/lib/export/pdf";
import StarTip from "@/components/reports/star-tip";

function pillClass(rag: RagTone): string {
  if (rag === "green") return "pill-green";
  if (rag === "amber") return "pill-amber";
  if (rag === "red") return "pill-red";
  return "pill-neutral";
}

function Cell({ cell, align }: { cell: ReportCell; align?: "left" | "right" }) {
  const alignClass = align === "right" ? "text-right" : "text-left";
  if (cell.rag) {
    return (
      <td className={`px-3 py-2 ${alignClass}`}>
        <span className={pillClass(cell.rag)}>{cell.text}</span>
      </td>
    );
  }
  return (
    <td className={`px-3 py-2 ${alignClass} ${cell.strong ? "font-semibold text-white" : "text-white/80"}`}>
      {cell.text}
      {cell.star ? <StarTip text={cell.star} /> : null}
    </td>
  );
}

function Block({ block }: { block: ReportBlock }) {
  if (block.kind === "heading") {
    return <h2 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">{block.text}</h2>;
  }
  if (block.kind === "paragraph") {
    return <p className="mb-3 text-sm text-white/70">{block.text}</p>;
  }
  if (block.kind === "spacer") {
    return <div className="h-3" />;
  }
  if (block.kind === "keyvalues") {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {block.pairs.map((p, i) => (
          <div key={`${p.label}-${i}`}>
            <p className="text-[11px] uppercase text-white/40">{p.label}</p>
            <p className="text-sm text-white/85">{p.value || "Not set"}</p>
          </div>
        ))}
      </div>
    );
  }
  // table
  return (
    <div className="glass-card overflow-x-auto p-0">
      {block.caption ? <p className="px-3 pt-3 text-xs text-white/50">{block.caption}</p> : null}
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase text-white/50">
            {block.columns.map((c, i) => (
              <th
                key={c.header + i}
                className={`px-3 py-2 ${c.align === "right" ? "text-right" : "text-left"}`}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.length === 0 ? (
            <tr>
              <td colSpan={block.columns.length} className="px-3 py-6 text-center text-white/50">
                {block.emptyText ?? "Nothing to report."}
              </td>
            </tr>
          ) : (
            block.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-white/5 align-top">
                {row.map((cell, ci) => (
                  <Cell key={ci} cell={cell} align={block.columns[ci]?.align} />
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportDocView({ doc }: { doc: ReportDoc }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">{doc.title}</h1>
        {doc.subtitle ? <p className="page-subtitle">{doc.subtitle}</p> : null}
      </div>

      {doc.meta && doc.meta.length > 0 ? (
        <div className="glass-card grid gap-3 p-5 sm:grid-cols-3">
          {doc.meta.map((p, i) => (
            <div key={`${p.label}-${i}`}>
              <p className="text-[11px] uppercase text-white/40">{p.label}</p>
              <p className="text-sm text-white/85">{p.value || "Not set"}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        {doc.blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </div>

      {doc.footerNote ? <p className="pt-2 text-xs text-white/40">{doc.footerNote}</p> : null}
    </div>
  );
}
