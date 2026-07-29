const OUTCOMES: Array<{ title: string; body: string }> = [
  {
    title: "Less time on admin",
    body: "No rekeying dates into a spreadsheet and no chasing paper round the office. The compliance calendar keeps itself, so the time goes back into care.",
  },
  {
    title: "You hear about it early",
    body: "Reminders and the daily digest do the nagging, so you learn a supervision is due or a DBS is running out while there is still time to do something.",
  },
  {
    title: "Calm on inspection day",
    body: "The Evidence is already gathered, timestamped and one click from a report, so the visit is a conversation rather than a scramble.",
  },
];

export default function Outcomes() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold sm:text-3xl">What changes for your service</h2>
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
