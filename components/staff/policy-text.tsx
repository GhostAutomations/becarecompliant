"use client";

/**
 * Be Care Compliant — a written policy, read as a web page.
 *
 * Phil chose this over showing the generated PDF (2026-07-26): most Team Members
 * read on a phone, and text that reflows at a sensible size beats pinch-zooming a
 * PDF of the same words. The frozen PDF still exists as the record and is one tap
 * away, so nothing is lost.
 *
 * Nothing here is HTML from the customer: the paste is parsed into blocks and
 * rendered as real React elements, so no markup, script or styling can come in
 * with the text.
 */

import { useEffect, useRef } from "react";
import { parsePolicyText, policyPlainText, readingMinutes, type PolicyBlock } from "@/lib/policies/text";

function Spans({ block }: { block: PolicyBlock }) {
  return (
    <>
      {block.spans.map((s, i) =>
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

export default function PolicyText({
  body,
  onReachedEnd,
}: {
  body: string;
  onReachedEnd: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const cb = useRef(onReachedEnd);
  cb.current = onReachedEnd;

  const blocks = parsePolicyText(body);
  const minutes = readingMinutes(policyPlainText(blocks));

  useEffect(() => {
    const node = endRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) cb.current();
      },
      { threshold: 1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-4">
      <p className="mb-4 text-xs text-white/40">About {minutes} minute{minutes === 1 ? "" : "s"} to read</p>

      <article className="space-y-3 text-[15px] leading-relaxed text-white/85">
        {blocks.map((block, i) => {
          if (block.kind === "heading") {
            const cls =
              block.level === 1
                ? "mt-6 text-lg font-semibold text-white"
                : block.level === 2
                  ? "mt-5 text-base font-semibold text-white"
                  : "mt-4 text-sm font-semibold uppercase tracking-wide text-white/70";
            return (
              <h3 key={i} className={cls}>
                <Spans block={block} />
              </h3>
            );
          }
          if (block.kind === "bullet") {
            return (
              <div key={i} className="flex gap-2.5">
                <span className="text-white/40">•</span>
                <p className="flex-1">
                  <Spans block={block} />
                </p>
              </div>
            );
          }
          if (block.kind === "numbered") {
            return (
              <div key={i} className="flex gap-2.5">
                <span className="shrink-0 text-white/40">{block.marker}</span>
                <p className="flex-1">
                  <Spans block={block} />
                </p>
              </div>
            );
          }
          return (
            <p key={i}>
              <Spans block={block} />
            </p>
          );
        })}
      </article>

      {/* The end marker: the Sign bar unlocks when this comes into view. */}
      <div ref={endRef} className="pt-8 text-center text-xs text-white/35">
        End of the policy
      </div>
    </div>
  );
}
