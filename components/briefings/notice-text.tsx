/**
 * Be Care Compliant — the words of a memo or message on screen: paragraphs, headings, bullets,
 * numbered points and bold, from lib/briefings/notice-text.ts. Real React elements only, never
 * HTML from the sender.
 */

import { parseNoticeText, type NoticeInline } from "@/lib/briefings/notice-text";

function Spans({ spans }: { spans: NoticeInline[] }) {
  return (
    <>
      {spans.map((s, i) =>
        s.bold ? (
          <strong key={i} className="font-semibold text-white">
            {s.text}
          </strong>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

export default function NoticeText({ body, compact = false }: { body: string | null; compact?: boolean }) {
  const blocks = parseNoticeText(body);
  if (blocks.length === 0) return null;
  const gap = compact ? "space-y-2" : "space-y-3";
  const text = compact ? "text-sm" : "text-[15px]";
  return (
    <div className={`${gap} ${text} leading-relaxed text-white/85`}>
      {blocks.map((b, i) => {
        if (b.kind === "heading") {
          return (
            <p key={i} className={`${b.level === 1 ? "text-lg" : "text-base"} font-semibold text-white`}>
              <Spans spans={b.spans} />
            </p>
          );
        }
        if (b.kind === "bullet" || b.kind === "numbered") {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="shrink-0 text-white/60">{b.kind === "bullet" ? "•" : b.marker}</span>
              <span>
                <Spans spans={b.spans} />
              </span>
            </div>
          );
        }
        return (
          <p key={i}>
            {b.lines.map((line, j) => (
              <span key={j}>
                {j > 0 ? <br /> : null}
                <Spans spans={line} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
