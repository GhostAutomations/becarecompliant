import type { Metadata } from "next";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { getEvidenceView } from "@/lib/evidence/on-demand";
import { isBinaryField, isPresentational, type AnswerValue } from "@/lib/form-schema";
import { shouldShowInEvidence } from "@/lib/form-validate";
import { formatAnswerForDisplay } from "@/lib/form-format";

export const metadata: Metadata = { title: "Evidence" };

/**
 * A drawn signature, if the answer holds one.
 *
 * Phil, 2026-07-29: he ticked "Completed over the phone", signed, and the PDF said
 * "Signature captured" while this page said "Not provided" for the same record. A
 * record that says a signature is missing on screen and present in the PDF is worse
 * than either being wrong alone.
 *
 * The cause: the shared renderer captures a drawn signature as a PNG data URL held in
 * the ANSWER (components/forms/form-renderer.tsx), and only the policy signing path
 * turns it into a stored file. This page assumed every signature and upload was a file
 * row, looked it up by field key, found nothing and printed "Not provided". So the page
 * now reads the answer as well, through the same formatter the PDF uses, and draws the
 * signature when it is there. Generic: any signature field on any Form.
 */
function drawnSignature(value: AnswerValue | undefined): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.startsWith("data:image/png;base64,") || v.startsWith("data:image/jpeg;base64,")
    ? v
    : null;
}

function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Where "Back" goes.
 *
 * Phil, 2026-07-27: opening Evidence from Briefings and pressing Back dropped him
 * in the People department. The page cannot guess where somebody came from, so
 * the link that sent them here says: ?from=briefings, ?from=my. Without it we
 * fall back to the record the Evidence belongs to, which is right when you opened
 * it from a record.
 *
 * This matters most for a Team Member: their own submissions used to send them
 * "Back to person", a page their role cannot open.
 */
const BACK_TARGETS: Record<string, { href: string; label: string }> = {
  briefings: { href: "/briefings", label: "Back to Briefings" },
  my: { href: "/my", label: "Back to my area" },
};

export default async function EvidenceViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { profile } = await requireCompany();
  const { id } = await params;
  const { from } = await searchParams;
  const cameFrom = from ? BACK_TARGETS[from] : undefined;

  const result = await getEvidenceView(id, { id: profile.id, email: profile.email, role: profile.role });

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <BackLink href="/people" label="Back" />
        <div className="glass-card p-6 text-sm text-white/70">{result.error}</div>
      </div>
    );
  }

  const ev = result.data;
  const backHref = cameFrom
    ? cameFrom.href
    : ev.recordType === "person"
      ? `/people/${ev.recordId}`
      : ev.recordType === "complaint"
        ? `/complaints/${ev.recordId}`
        : `/service-users/${ev.recordId}`;
  const backLabel = cameFrom
    ? cameFrom.label
    : ev.recordType === "person"
      ? "Back to person"
      : ev.recordType === "complaint"
        ? "Back to complaint"
        : "Back to service user";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackLink href={backHref} label={backLabel} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{ev.formName}</h1>
          <p className="page-subtitle">Completed evidence, stored unchanged as your inspection record.</p>
        </div>
        <a href={`/api/evidence/${ev.id}/pdf`} className="btn-primary px-4 py-2 text-sm">
          Download PDF
        </a>
      </div>

      <div className="glass-card grid gap-3 p-5 sm:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase text-white/40">Completed by</p>
          <p className="text-sm text-white/85">{ev.authorName ?? "Unknown"}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-white/40">Completed at</p>
          <p className="text-sm text-white/85">{fmtDateTime(ev.submittedAt)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-white/40">Form version</p>
          <p className="text-sm text-white/85">Version {ev.formVersion}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-white/40">Branch</p>
          <p className="text-sm text-white/85">{ev.branchName ?? "Not set"}</p>
        </div>
      </div>

      {ev.schema.sections.map((section) => {
        // Same rule as the PDF (shouldShowInEvidence): a conditional field nobody was
        // asked is left out, but anything actually answered is always shown, so the two
        // renderings of one immutable record can never disagree.
        const answerable = section.fields.filter(
          (f) => !isPresentational(f.type) && shouldShowInEvidence(f, ev.answers),
        );
        if (answerable.length === 0) return null;
        return (
          <div key={section.id} className="glass-card p-5">
            {section.title ? (
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">{section.title}</h2>
            ) : null}
            <dl className="space-y-3">
              {answerable.map((field) => {
                const value = ev.answers[field.key];
                const file = ev.files[field.key];
                const signature = field.type === "signature" ? drawnSignature(value) : null;
                return (
                  <div key={field.key} className="border-t border-white/5 pt-3 first:border-t-0 first:pt-0">
                    <dt className="text-xs text-white/45">{field.label}</dt>
                    {/* whitespace-pre-line: a long_text answer can hold real line breaks (the AI
                        drafted Return to Work questions are stored as Q and A blocks, migration
                        0147), and without this they collapse into one run on paragraph. */}
                    <dd className="mt-0.5 whitespace-pre-line text-sm text-white/90">
                      {isBinaryField(field.type) && file ? (
                        <a
                          href={`/api/evidence/${ev.id}/file?key=${encodeURIComponent(field.key)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gold-300 underline"
                        >
                          {file.kind === "signature" ? "View signature" : file.fileName}
                        </a>
                      ) : signature ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={signature}
                            alt="Signature captured"
                            className="mt-1 h-16 w-auto rounded-lg bg-white p-1"
                          />
                          <span className="mt-1 block text-xs text-white/50">Signature captured</span>
                        </>
                      ) : (
                        formatAnswerForDisplay(field, value)
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        );
      })}

      <p className="text-xs text-white/40">
        This evidence is immutable. The PDF is generated from the same stored snapshot, so it always
        matches what is shown here.
      </p>
    </div>
  );
}
