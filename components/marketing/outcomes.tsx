/**
 * "What changes for your service" (Phil, 2026-10-14: "Shorter page"). One section in place of two
 * that said much the same thing: "Built for care, not bent into shape" (three things you get as
 * standard) and "What changes for your service" (three outcomes). Each card now gives the outcome
 * and the reason for it, so the page makes the point once.
 */

const OUTCOMES: Array<{ title: string; body: string }> = [
  {
    title: "Less time on admin",
    body: "Supervisions, spot checks, DBS, mandatory training and care plan reviews are built in and named the way your regulator names them. Complete the Form and the Check closes, the Evidence is stored and the next due date is set, all in one step.",
  },
  {
    title: "You hear about it early",
    body: "Reminders and the daily digest do the nagging, so you learn a supervision is due or a DBS is running out while there is still time to do something.",
  },
  {
    title: "Calm on inspection day",
    body: "Every completed Form is timestamped, attributed and version stamped. When an inspector asks to see your work you export it rather than assemble it, so the visit is a conversation rather than a scramble.",
  },
];

export default function Outcomes() {
  return (
    <section className="border-y border-white/10 bg-white/[0.03]">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl">What changes for your service</h2>
          <p className="mt-3 text-white/75">
            Software written for care in the first place, rather than bent into shape afterwards.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {OUTCOMES.map((o) => (
            <div key={o.title} className="glass-card p-6">
              <h3 className="text-base font-semibold text-white">{o.title}</h3>
              <p className="mt-2 text-sm text-white/75">{o.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
