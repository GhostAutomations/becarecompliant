/**
 * Said where the Complete button would be when a check has no form linked to it (DEF-108, Phil,
 * 2 Oct 2026, popup "Both guards"). Thistle's Spot Check lost its form and Gabbie, on her round,
 * got no Complete button and a Planner booking that bounced back to the record with no reason.
 * A check with no form cannot be completed; the person in front of it should know why, and who
 * can put it right.
 */
export function NoFormLinked({ checkName, className = "" }: { checkName: string; className?: string }) {
  return (
    <p role="status" className={`rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-100 ${className}`}>
      No form is linked to {checkName}, so it cannot be completed yet. Ask your Admin to link one in Settings, Forms.
    </p>
  );
}
