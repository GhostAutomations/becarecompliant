const OUTCOMES: Array<{ title: string; body: string }> = [
  {
    title: "Less time on admin",
    body: "Stop rekeying dates and chasing paper. The compliance calendar keeps itself, so your team gets their time back for care.",
  },
  {
    title: "Nothing slips through",
    body: "Reminders and chasers do the nagging for you, so a missed supervision or an expired DBS becomes a thing of the past.",
  },
  {
    title: "Calm on inspection day",
    body: "The evidence is already gathered, timestamped and one click from a report, so the visit is a conversation, not a scramble.",
  },
];

export default function Outcomes() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold sm:text-3xl">What it changes for your service</h2>
      </div>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {OUTCOMES.map((o) => (
          <div key={o.title} className="glass-card p-6 text-center">
            <h3 className="text-lg font-semibold text-white">{o.title}</h3>
            <p className="mt-2 text-sm text-white/75">{o.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
