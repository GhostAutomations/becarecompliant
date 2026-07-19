import Link from "next/link";

/**
 * Social proof, ready to fill. Add real quotes to TESTIMONIALS once you have launch
 * customers (never fabricate them). While it is empty we show an honest early adopter
 * callout instead, so the section still earns its place without inventing proof.
 */
type Testimonial = { quote: string; name: string; role: string };

const TESTIMONIALS: Testimonial[] = [];

export default function SocialProof() {
  if (TESTIMONIALS.length === 0) {
    return (
      <section className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-gold-300">New and growing</span>
          <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Be one of the first to run compliance this way</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/75">
            Be Care Compliant is built by people who run real care services, for the managers who live under
            inspection pressure. Start a free trial and help shape where it goes next.
          </p>
          <div className="mt-6">
            <Link href="/start-trial" className="btn-primary">Start your 14 day free trial</Link>
          </div>
        </div>
      </section>
    );
  }

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
