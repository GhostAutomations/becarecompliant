import { exitManageAs } from "@/app/(app)/founder/actions";

/**
 * Persistent banner shown across the app while the founder is managing as a
 * company. Amber, unmissable, with a one-click Exit. The session also auto
 * expires after 30 minutes (the cookie ttl), after which the app returns to the
 * founder's own view.
 */
export function ManageAsBanner({ companyName }: { companyName: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/40 bg-amber-500/15 px-4 py-2 md:px-8">
      <p className="text-xs font-medium text-amber-100">
        Managing as <span className="font-semibold">{companyName}</span>. You are
        acting inside this company for support. Everything you do is recorded.
      </p>
      <form action={exitManageAs}>
        <button type="submit" className="btn-ghost px-3 py-1 text-xs">
          Exit support mode
        </button>
      </form>
    </div>
  );
}
