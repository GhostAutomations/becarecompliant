/**
 * Be Care Compliant — one foldable section of a Settings page.
 *
 * Phil, 2026-09-21, of Users and User access: "lets have things minimised inside so its not all
 * open and messy." Seven blocks of settings down one page is a scroll, not a screen. Closed by
 * default, one line each, and the count beside the heading so a section that has something in it
 * says so without being opened.
 *
 * A plain <details>, so it needs no JavaScript, keeps its arrow keys and screen reader behaviour,
 * and a browser's own Find on Page still opens it.
 */
export default function SettingsSection({
  title,
  summary,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** One line under the heading, for what this section is for. */
  summary?: string;
  /** Shown beside the title, e.g. how many pending invites there are. */
  count?: number | string | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="fold glass-card overflow-hidden" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:bg-white/[0.04]">
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-base font-semibold text-white">{title}</span>
            {count !== null && count !== undefined && count !== "" ? (
              <span className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-xs text-white/70">
                {count}
              </span>
            ) : null}
          </span>
          {summary ? <span className="mt-0.5 block text-sm text-white/55">{summary}</span> : null}
        </span>
        <span aria-hidden className="fold-chevron shrink-0 text-lg text-white/40 transition-transform">
          ›
        </span>
      </summary>
      <div className="border-t border-white/10 px-5 py-5">{children}</div>
    </details>
  );
}
