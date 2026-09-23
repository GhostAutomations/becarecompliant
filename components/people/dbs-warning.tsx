"use client";

/**
 * "Are you sure?" about DBS dates that look typed wrong (DEF-059). Warn, never refuse: a
 * certificate on the Update Service can properly run longer than three years.
 */
export default function DbsWarning({
  warnings,
  onConfirm,
  onBack,
}: {
  warnings: string[];
  onConfirm: () => void;
  onBack: () => void;
}) {
  if (warnings.length === 0) return null;
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-rag-amber/30 bg-rag-amber/10 p-4">
      <p className="text-sm font-semibold text-rag-amber-soft">Are these DBS dates right?</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-white/80">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <p className="text-xs text-white/55">
        If they are on the DBS Update Service, or the dates are right for another reason, save
        anyway.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={onConfirm}>
          Save anyway
        </button>
        <button type="button" className="btn-ghost px-3 py-2 text-sm text-white/70" onClick={onBack}>
          Go back and check
        </button>
      </div>
    </div>
  );
}
