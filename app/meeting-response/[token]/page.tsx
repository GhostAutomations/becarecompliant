import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/admin";
import MeetingResponseForm from "@/components/absence/meeting-response-form";

/**
 * PUBLIC page: an employee answers their absence meeting invitation. No login;
 * the unguessable token in the URL is the capability, and all reads go through
 * the service client by exact token match (in middleware PUBLIC_PATHS).
 * Responding is a POST (the server action), so an email scanner following the
 * link can never accept or decline by accident.
 */

export const metadata: Metadata = { title: "Meeting invitation" };
export const dynamic = "force-dynamic";

function formatDateUk(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function MeetingResponsePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ intent?: string }>;
}) {
  const { token } = await params;
  const { intent } = await searchParams;

  let meeting: {
    stage: number | null;
    meeting_date: string | null;
    meeting_time: string | null;
    duration_minutes: number | null;
    location: string | null;
    response: string | null;
    person_name: string;
    company_name: string;
  } | null = null;

  if (/^[0-9a-f-]{36}$/i.test(token)) {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("absence_meetings")
      .select("stage, meeting_date, meeting_time, duration_minutes, location, response, person:person_id(full_name), company:company_id(name)")
      .eq("response_token", token)
      .maybeSingle();
    if (data) {
      const person = data.person as { full_name: string } | { full_name: string }[] | null;
      const company = data.company as { name: string } | { name: string }[] | null;
      meeting = {
        stage: data.stage,
        meeting_date: data.meeting_date,
        meeting_time: data.meeting_time,
        duration_minutes: data.duration_minutes,
        location: data.location,
        response: data.response,
        person_name: (Array.isArray(person) ? person[0]?.full_name : person?.full_name) ?? "",
        company_name: (Array.isArray(company) ? company[0]?.name : company?.name) ?? "",
      };
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-navy-950 via-navy-900 to-navy-800 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur">
        <p className="text-sm font-bold text-white">
          Be Care <span className="text-gold-400">Compliant</span>
        </p>
        {!meeting ? (
          <p className="mt-4 text-sm text-white/70">
            This link is not valid. If you were expecting a meeting invitation,
            please contact your manager.
          </p>
        ) : (
          <>
            <h1 className="mt-4 text-lg font-semibold text-white">
              {meeting.stage ? `Stage ${meeting.stage} absence management meeting` : "Absence management meeting"}
            </h1>
            <p className="mt-2 text-sm text-white/70">
              For {meeting.person_name} at {meeting.company_name}.
            </p>
            {meeting.meeting_date && (
              <p className="mt-1 text-sm text-white/85">
                {formatDateUk(meeting.meeting_date)}
                {meeting.meeting_time ? ` at ${String(meeting.meeting_time).slice(0, 5)}` : ""}
                {meeting.duration_minutes ? `, ${meeting.duration_minutes} minutes` : ""}
              </p>
            )}
            {meeting.location && (
              <p className="mt-1 text-sm text-white/85">Location: {meeting.location}</p>
            )}
            <p className="mt-3 text-xs text-white/50">
              You have the right to be accompanied by a colleague or a trade union
              representative.
            </p>
            <div className="mt-5">
              {meeting.response ? (
                <p className="text-sm text-white/85">
                  This invitation has already been answered:{" "}
                  <span className={meeting.response === "accepted" ? "text-emerald-300" : "text-red-300"}>
                    {meeting.response}
                  </span>
                  . If something has changed, please contact your manager.
                </p>
              ) : (
                <MeetingResponseForm token={token} initialIntent={intent} />
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
