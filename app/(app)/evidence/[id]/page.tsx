import type { Metadata } from "next";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { getEvidenceView } from "@/lib/evidence/on-demand";
import { isBinaryField, isPresentational } from "@/lib/form-schema";

export const metadata: Metadata = { title: "Evidence" };

function displayAnswer(value: unknown): string {
  if (value == null || value === "") return "Not answered";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Not answered";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    const parts = Object.values(value as Record<string, unknown>).filter(Boolean).map(String);
    return parts.length ? parts.join(", ") : "Not answered";
  }
  return String(value);
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

export default async function EvidenceViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCompany();
  const { id } = await params;

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
  const backHref = ev.recordType === "person" ? `/people/${ev.recordId}` : `/service-users/${ev.recordId}`;
  const backLabel = ev.recordType === "person" ? "Back to person" : "Back to service user";

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
        const answerable = section.fields.filter((f) => !isPresentational(f.type));
        if (answerable.length === 0) return null;
        return (
          <div key={section.id} className="glass-card p-5">
            {section.title ? (
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">{section.title}</h2>
            ) : null}
            <dl className="space-y-3">
              {answerable.map((field) => (
                <div key={field.key} className="border-t border-white/5 pt-3 first:border-t-0 first:pt-0">
                  <dt className="text-xs text-white/45">{field.label}</dt>
                  <dd className="mt-0.5 text-sm text-white/90">
                    {isBinaryField(field.type) ? (
                      ev.files[field.key] ? (
                        <a
                          href={`/api/evidence/${ev.id}/file?key=${encodeURIComponent(field.key)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gold-300 underline"
                        >
                          {ev.files[field.key].kind === "signature" ? "View signature" : ev.files[field.key].fileName}
                        </a>
                      ) : (
                        "Not provided"
                      )
                    ) : (
                      displayAnswer(ev.answers[field.key])
                    )}
                  </dd>
                </div>
              ))}
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
