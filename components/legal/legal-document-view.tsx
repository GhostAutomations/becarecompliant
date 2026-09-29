import { parseLegalMarkdown, type Run } from "@/lib/legal/markdown";

/**
 * One contract document, drawn from its text (lib/legal/text.ts via lib/legal/documents.ts).
 * Used by the public pages (/terms, /dpa) and by the accept screen, so what a Company Admin
 * accepts is exactly what the public page shows.
 *
 * React elements only: nothing in the text becomes HTML, so it cannot inject markup.
 */

function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, i) =>
        r.bold ? (
          <strong key={i} className="font-semibold text-white">
            {r.text}
          </strong>
        ) : (
          <span key={i}>{r.text}</span>
        ),
      )}
    </>
  );
}

export default function LegalDocumentView({
  text,
  showTitle = true,
  compact = false,
}: {
  text: string;
  showTitle?: boolean;
  /** Smaller type for the scrolling copy on the accept screen. */
  compact?: boolean;
}) {
  const blocks = parseLegalMarkdown(text);
  const body = compact ? "text-xs leading-relaxed text-white/75" : "text-sm leading-relaxed text-white/75";
  return (
    <div className="legal-doc">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "title":
            return showTitle ? (
              <h1 key={i} className={compact ? "text-base font-semibold text-white" : "text-3xl font-bold text-white sm:text-4xl"}>
                {b.text}
              </h1>
            ) : null;
          case "heading":
            return (
              <h2
                key={i}
                id={b.id}
                className={`scroll-mt-24 font-semibold text-white ${compact ? "mt-5 text-sm" : "mt-10 text-lg"}`}
              >
                {b.text}
              </h2>
            );
          case "rule":
            return <hr key={i} className="my-8 border-white/10" />;
          case "para":
            return (
              <p key={i} className={`mt-3 ${body}`}>
                <Runs runs={b.runs} />
              </p>
            );
          case "table":
            return (
              <div key={i} className="mt-4 overflow-x-auto rounded-lg border border-white/10">
                <table className={`w-full border-collapse text-left ${compact ? "text-xs" : "text-sm"}`}>
                  {b.header ? (
                    <thead className="bg-white/[0.04] text-white">
                      <tr>
                        {b.header.map((c, j) => (
                          <th key={j} className="border-b border-white/10 px-3 py-2 align-top font-semibold">
                            <Runs runs={c} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                  ) : null}
                  <tbody className="text-white/75">
                    {b.rows.map((row, r) => (
                      <tr key={r} className="border-b border-white/5 last:border-0">
                        {row.map((c, j) => (
                          <td key={j} className={`px-3 py-2 align-top ${j === 0 && !b.header ? "font-medium text-white/90" : ""}`}>
                            <Runs runs={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
