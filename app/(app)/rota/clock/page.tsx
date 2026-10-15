import type { Metadata } from "next";
import Link from "next/link";
import { requireRotaOffice } from "@/lib/rota/access";
import { getRotaBranches } from "@/lib/rota/data";
import { getBranchPlaces, getClockProblems } from "@/lib/rota/clock-data";
import { createClient } from "@/lib/supabase/server";
import ActionForm from "@/components/rota/rota-action";
import BackLink from "@/components/back-link";
import RotaTabs from "@/components/rota/rota-tabs";
import PlaceControls from "@/components/rota/place-controls";
import { newSheetAction, resolveClockProblemAction, setPlaceRadiusAction } from "@/lib/rota/clock-actions";

export async function generateMetadata(): Promise<Metadata> {
  await requireRotaOffice();
  return { title: "Clock in" };
}

const SOURCE_WORDS: Record<string, string> = {
  postcode: "From the postcode (rough: set it at the home or on the map)",
  map: "Set on the map",
  on_site: "Set at the home",
};

/**
 * Clock in places (Rota and Visits Stage 3, Phil 2026-10-16): each service user's home and the
 * branch office, with the map point clock ins are checked against, its radius, the printed QR
 * sheet with its text code, and any record the server refused from a carer's phone.
 */
export default async function RotaClockPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { profile, companyId } = await requireRotaOffice();
  const sp = await searchParams;
  const branches = await getRotaBranches(companyId, !!profile.actingAsCompanyId);
  const branch = branches.find((b) => b.id === sp.branch) ?? branches[0] ?? null;
  const [places, problems] = branch ? await Promise.all([getBranchPlaces(branch.id), getClockProblems(branch.id)]) : [[], []];
  let codes = new Map<string, { token: string; code: string }>();
  if (places.length) {
    const supabase = await createClient();
    const { data } = await supabase.from("rota_places").select("id, qr_token, text_code").in("id", places.map((p) => p.placeId));
    codes = new Map(((data as { id: string; qr_token: string; text_code: string }[] | null) ?? []).map((r) => [r.id, { token: r.qr_token, code: r.text_code }]));
  }
  const noPoint = places.filter((p) => p.lat == null).length;

  return (
    <div className="page-shell space-y-5">
      <BackLink href={branch ? `/rota?branch=${branch.id}` : "/rota"} label="Rota" />
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">Clock in</h1>
          <span className="pill pill-amber">Beta</span>
        </div>
        <p className="text-sm text-white/60">
          Where each home and the branch office is, so clock ins can be checked. Print each home&apos;s sheet for its folder: carers scan the QR code, or text the code if they have no smartphone.
        </p>
      </div>
      {branch ? <RotaTabs active="clock" branchId={branch.id} /> : null}
      {branches.length > 1 ? (
        <nav aria-label="Branch" className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link key={b.id} href={`/rota/clock?branch=${b.id}`} className={`pill ${branch && b.id === branch.id ? "pill-amber" : "pill-neutral"}`}>
              {b.name}
            </Link>
          ))}
        </nav>
      ) : null}
      {!branch ? <p className="text-sm text-white/55">You are not linked to a branch yet.</p> : null}

      {problems.length ? (
        <section className="glass-card space-y-2 border-red-500/30 p-4" aria-label="Not accepted">
          <h2 className="text-sm font-semibold text-white">Clock ins not accepted ({problems.length})</h2>
          <p className="text-xs text-white/55">The server refused these from a carer&apos;s phone. The carer has been shown the reason. Check with them, add the time on the visit if needed, then clear it.</p>
          {problems.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
              <span className="text-xs text-white/80">
                {p.name ?? "A carer"}, {p.kind === "out" ? "clock out" : "clock in"},{" "}
                {new Date(p.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}: {p.reason}
              </span>
              <ActionForm action={resolveClockProblemAction} hidden={{ problem_id: p.id }} label="Clear" savingLabel="Clearing…" savedLabel="Cleared" buttonClassName="btn-ghost px-2 py-1 text-xs" className="" />
            </div>
          ))}
        </section>
      ) : null}

      {branch && places.length ? (
        <p className="text-sm text-white/70">
          {noPoint ? `${noPoint} place${noPoint === 1 ? " has" : "s have"} no map point yet (no postcode found), so clock ins there show as Location unclear.` : "Every place has a map point."}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {places.map((p) => {
          const c = codes.get(p.placeId);
          return (
            <section key={p.placeId} aria-label={p.name} className="glass-card space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white/90">{p.name}</h2>
                  <p className="text-xs text-white/50">
                    {p.forBranch ? "Branch office" : "Home"} · {p.postcode ?? "No postcode"}
                  </p>
                </div>
                <span className={`pill ${p.lat == null ? "pill-red" : p.source === "postcode" ? "pill-amber" : "pill-green"}`}>
                  {p.lat == null ? "No map point" : p.source === "postcode" ? "Rough point" : "Point set"}
                </span>
              </div>
              <p className="text-xs text-white/60">{p.lat == null ? "No map point yet." : SOURCE_WORDS[p.source]}</p>

              <ActionForm action={setPlaceRadiusAction} hidden={{ place_id: p.placeId }} label="Save" className="flex flex-wrap items-end gap-2" buttonClassName="btn-primary px-3 py-1.5 text-xs" showOk>
                <label className="w-36">
                  <span className="form-label">Radius (metres)</span>
                  <input type="number" name="radius" min={25} max={2000} step={5} defaultValue={p.radius} required />
                </label>
              </ActionForm>

              {c ? <PlaceControls placeId={p.placeId} token={c.token} /> : null}

              {c ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                  <span className="text-xs text-white/60">
                    Text code <span className="font-mono text-sm font-semibold tracking-widest text-white">{c.code}</span>
                  </span>
                  <Link href={`/clock-sheet/${p.placeId}`} className="btn-outline px-3 py-1.5 text-xs" target="_blank">
                    Print sheet
                  </Link>
                  <ActionForm
                    action={newSheetAction}
                    hidden={{ place_id: p.placeId }}
                    label="New sheet"
                    savingLabel="Making…"
                    savedLabel="Made"
                    buttonClassName="btn-ghost px-3 py-1.5 text-xs"
                    className=""
                    confirm="Make a new sheet? The old QR code, any NFC sticker and the old text code stop working straight away, so print the new sheet and replace the old one."
                  />
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
