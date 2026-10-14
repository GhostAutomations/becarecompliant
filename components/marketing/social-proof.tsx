/**
 * Social proof, ready to fill. Add real quotes to TESTIMONIALS once you have launch
 * customers (never fabricate them). While it is empty nothing shows at all.
 */
type Testimonial = { quote: string; name: string; role: string };

const TESTIMONIALS: Testimonial[] = [];

export default function SocialProof() {
  // HIDDEN UNTIL THERE IS A REAL QUOTE (Phil, 2026-10-14, popup). The "Be one of the first"
  // invitation is gone; the band comes back on its own as soon as a real testimonial is added.
  if (TESTIMONIALS.length === 0) return null;

  return (
    <section className="border-y border-white/10 bg-white/[0.03]">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-2xl font-semibold sm:text-3xl">Loved by the teams who run care</h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="glass-card p-6">
              <blockquote className="text-sm text-white/85">&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption className="mt-4 text-xs text-white/55">
                <span className="font-semibold text-white/80">{t.name}</span>, {t.role}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
