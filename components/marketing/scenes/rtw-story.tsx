import Story from "./story";
import { d } from "./timing";
import { s } from "./class-names";

/**
 * Be Care Compliant: Return to Work by text (Phil, 2026-10-14, popup).
 *
 * What the app really does (components/absence/rtw-send-panel.tsx, lib/absence/rtw-questions.ts):
 * the Return to Work questions, drafted by AI for the manager to check, go to the member of staff
 * by text with a link to their portal; they sign in and answer, and the answers come back to the
 * Return to Work with the note "Owain answered these through their portal on 14/10/2026". The
 * button says "Send to Owain by text"; the text is the app's own wording (rtwSmsBody). Pro only,
 * because texts are (lib/billing/tier.ts sms_reminders), which the section around it says.
 */

const QUESTIONS = [
  "How are you feeling now, and are you fit to return to all of your duties?",
  "Is there anything we can do to support you over the next few weeks?",
  "Did you see a doctor, and do you have a fit note to upload?",
];

export default function RtwStory() {
  return (
    <Story
      durationMs={5000}
      label="A short animation: Return to Work questions are checked and sent to a member of staff by text, they answer in their portal, and their answers arrive back on the Return to Work."
      className={s.frame}
    >
      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_11rem] sm:p-5">
        <div className="space-y-3">
          <div className="glass-card flex flex-wrap items-center justify-between gap-2 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">Owain Pritchard</p>
              <p className="text-[11px] text-white/55">Sickness, off 08/10/2026 to 10/10/2026, Riverside</p>
            </div>
            <span className="pill-amber shrink-0">Stage 1 Due</span>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Return to Work questions</p>
              <span className="inline-flex items-center rounded-full bg-gold-400/15 px-2 py-0.5 text-[10px] font-bold text-gold-300 ring-1 ring-inset ring-gold-400/30">
                AI
              </span>
            </div>
            <ol className="mt-2 space-y-1.5 text-[12px] text-white/80">
              {QUESTIONS.map((q, i) => (
                <li key={q} className="flex gap-2">
                  <span className="text-white/55">{i + 1}.</span>
                  <span>{q}</span>
                </li>
              ))}
            </ol>
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[12px] text-white/70">
                <span className={`${s.swap} ${s.swapStart}`}>
                  <span className={s.before} style={d(1500)}>
                    Check these questions first, then send them to Owain. They get a text with a link and answer in their
                    portal.
                  </span>
                  <span className={s.after} style={d(1550)}>
                    Sent to the phone ending 4471 on 14/10/2026. Waiting for Owain to answer.
                  </span>
                </span>
              </p>
              <span className={`${s.press} mt-2 inline-flex`} style={d(1100)}>
                <span className="btn-primary px-3 py-1.5 text-xs">
                  <span className={s.swap}>
                    <span className={s.before} style={d(1500)}>Send to Owain by text</span>
                    <span className={s.after} style={d(1550)}>Send the text again</span>
                  </span>
                </span>
              </span>
            </div>
            <p
              className={`${s.appear} mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-[12px] text-white/80`}
              style={d(4200)}
            >
              Owain answered these through their portal on 14/10/2026.
            </p>
          </div>
        </div>

        {/* The phone: the text the app sends, then the portal's own thank you once they have answered
            (components/staff/rtw-answer-form.tsx). */}
        <div className={`${s.phone} self-center`}>
          <p className="text-center text-[10px] text-white/55">Messages</p>
          <div className={`${s.appear} ${s.bubble} mt-3`} style={d(2200)}>
            Hi Owain, Riverside Care would like you to answer a few questions before your Return to Work meeting.
            Please sign in to answer them: becarecompliant.com/my/return-to-work
          </div>
          <div className={`${s.appear} mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-snug text-white/80`} style={d(3300)}>
            Thank you. Your answers have gone to your manager, who will talk them through with you at your Return
            to Work meeting.
          </div>
        </div>
      </div>
    </Story>
  );
}
