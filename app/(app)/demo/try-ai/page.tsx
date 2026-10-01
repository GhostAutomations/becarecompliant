import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import BackLink from "@/components/back-link";
import { AiIcon } from "@/components/ai-icon";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getCompanyDemo, getMyDemoLogin } from "@/lib/demo/data";
import { rtwHref } from "@/lib/absence/rtw-list";

export const metadata: Metadata = { title: "Try the AI" };

/**
 * TRY THE AI (Phil, 2026-10-01, popup: build it with the demo). A demo only page that puts every
 * AI button in one place, says in two lines what each one does, and opens a sample record that is
 * ready for it, so a demo client spends their 5 credits on the things that sell the product rather
 * than hunting for them. Nothing here runs the AI itself: each link opens the real screen, so what
 * they try is exactly what a customer gets.
 */

type Feature = {
  title: string;
  what: string;
  steps: string[];
  href: string;
  cta: string;
};

export default async function TryAiPage() {
  const { user, profile } = await requireCompany();
  const demo = await getCompanyDemo(profile.company_id);
  if (!demo) redirect("/dashboard");
  const login = await getMyDemoLogin(user.id);
  const supabase = await createClient();
  const companyId = profile.company_id as string;

  const [{ data: rtw }, { data: incident }, { data: complaint }] = await Promise.all([
    supabase
      .from("absence_events")
      .select("id, people:person_id(full_name)")
      .eq("company_id", companyId)
      .is("rtw_evidence_id", null)
      .not("rtw_due_date", "is", null)
      .order("rtw_due_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("incidents")
      .select("id, category")
      .eq("company_id", companyId)
      .eq("status", "open")
      .order("occurred_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("complaints")
      .select("id, subject")
      .eq("company_id", companyId)
      .in("status", ["open", "in_progress"])
      .order("date_raised", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rtwRow = rtw as { id: string; people: { full_name: string } | { full_name: string }[] | null } | null;
  const rtwName = rtwRow ? (Array.isArray(rtwRow.people) ? rtwRow.people[0]?.full_name : rtwRow.people?.full_name) : null;
  const inc = incident as { id: string; category: string } | null;
  const comp = complaint as { id: string; subject: string } | null;

  const features: Feature[] = [
    {
      title: "Return to Work questions",
      what: "Writes the questions for a Return to Work meeting from the person's absence record, ready to ask.",
      steps: [
        rtwName ? `Open the Return to Work for ${rtwName}.` : "Open Absence and choose a Return to Work that is due.",
        "Press Draft it for me.",
        "Read the questions, change any you like, then save.",
      ],
      href: rtwRow ? rtwHref(rtwRow.id) : "/people/absence",
      cta: "Open the Return to Work",
    },
    {
      title: "Incident lines of enquiry",
      what: "Reads the incident report and drafts what the investigation needs to find out.",
      steps: [
        inc ? `Open the ${inc.category.toLowerCase()} incident.` : "Open an incident.",
        "In the investigation stage, press Draft the lines of enquiry.",
        "Use them as the starting point for the investigation.",
      ],
      href: inc ? `/incidents/${inc.id}` : "/incidents",
      cta: "Open the incident",
    },
    {
      title: "Complaint initial response",
      what: "Drafts a calm, professional first reply to the complainant from the complaint details.",
      steps: [
        comp ? `Open the complaint "${comp.subject}".` : "Open a complaint.",
        "Press Initial Response.",
        "Read the draft. Nothing is sent unless you choose to send it.",
      ],
      href: comp ? `/complaints/${comp.id}` : "/complaints",
      cta: "Open the complaint",
    },
    {
      title: "Inspection narrative",
      what: "Writes the narrative an inspector reads, from your own evidence, against the CIW framework.",
      steps: ["Open Inspection readiness.", "Press Draft inspection narrative.", "Read it, then copy it into your self assessment."],
      href: "/readiness",
      cta: "Open Inspection readiness",
    },
    {
      title: "Ask about your readiness",
      what: "Ask a question in plain English and get an answer from your own records.",
      steps: [
        "Open Inspection readiness.",
        "Type a question, for example: Where are we weakest on supervision?",
        "Press Ask.",
      ],
      href: "/readiness",
      cta: "Ask a question",
    },
    {
      title: "Regulation 73 visit report",
      what: "Drafts the Responsible Individual's visit report narrative from what the system already knows.",
      steps: ["Open the Regulation 73 reports.", "Start a report for a branch.", "Press Draft narrative with AI."],
      href: "/reports/reg73",
      cta: "Open Regulation 73",
    },
    {
      title: "Regulation 80 quality of care review",
      what: "Drafts the six monthly quality of care review from your checks, complaints, incidents and feedback.",
      steps: ["Open the Regulation 80 reviews.", "Start a review.", "Press Draft narrative with AI."],
      href: "/reports/reg80",
      cta: "Open Regulation 80",
    },
  ];

  const left = login ? Math.max(0, login.aiAllowance - login.aiUsed) : null;

  return (
    <div className="page-shell space-y-6">
      <BackLink href="/dashboard" label="Back to the dashboard" />
      <div>
        <h1 className="page-title">Try the AI</h1>
        <p className="page-subtitle">
          Every button marked <AiIcon size="xs" /> uses AI to save you time. Each use costs one credit.
          {left !== null
            ? left > 0
              ? ` You have ${left} of ${login?.aiAllowance} credits left in this demo, so pick the ones you would use most.`
              : " You have used all your demo credits. Everything else in the demo still works."
            : ""}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {features.map((f) => (
          <section key={f.title} className="glass-card flex flex-col gap-3 p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <AiIcon />
              {f.title}
            </h2>
            <p className="text-sm text-white/70">{f.what}</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-white/80">
              {f.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <div className="mt-auto pt-1">
              <Link href={f.href} className="btn-outline inline-flex">
                {f.cta}
              </Link>
            </div>
          </section>
        ))}
      </div>

      <p className="text-sm text-white/50">
        In a real account AI credits come with the plan each month, and more can be bought at any time.
      </p>
    </div>
  );
}
