/**
 * The one AI mark: a small gold "AI" chip shown before the words on every button that uses
 * AI credits, so staff can tell at a glance which actions cost credits.
 * Phil, 2026-09-28: "every AI button", then a sparkle on its own "isn't clear that it is AI",
 * so it is the letters AI in a chip, matching the AI tags on the Reg 80 narrative boxes.
 * The buttons are inline-flex with a gap and the chip is shorter than the text line, so it
 * never changes a button's size. Add it to any NEW button that calls the AI.
 *
 * tone "gold" sits on dark or outline buttons; "onGold" is for a solid gold (btn-primary)
 * button, where a gold chip would disappear.
 */
export function AiIcon({ tone = "gold", size = "sm" }: { tone?: "gold" | "onGold"; size?: "sm" | "xs" }) {
  const colours =
    tone === "onGold" ? "bg-navy-950/15 text-navy-950" : "bg-gold-400/15 text-gold-300 ring-1 ring-inset ring-gold-400/30";
  const sizing = size === "xs" ? "px-1.5 text-[9px]" : "px-1.5 py-px text-[10px]";
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center rounded-full font-bold leading-4 tracking-wide ${colours} ${sizing}`}>
      AI
    </span>
  );
}
