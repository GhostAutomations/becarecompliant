import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireRotaOffice } from "@/lib/rota/access";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import { ukMobileFromE164 } from "@/lib/rota/sheet-number";
import PrintButton from "./print-button";

export const metadata: Metadata = { title: "Clock in sheet" };

/**
 * The printed clock in sheet for one home or branch office (Rota and Visits Stage 3, Phil
 * 2026-10-16). It goes in the home's folder: a QR code carers scan with the phone camera, and the
 * text code for carers without a smartphone. It deliberately carries NO service user name or
 * address: it is left in the home, and the code alone says nothing about who lives there.
 *
 * Outside the app frame so it prints on its own; office roles only (requireRotaOffice), and the
 * place is read under the office's RLS, so another branch or company's sheet is Not Found.
 */
export default async function ClockSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { companyId } = await requireRotaOffice();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase
    .from("rota_places")
    .select("id, company_id, branch_id, for_branch, qr_token, text_code, updated_at, service_users(full_name), branches(name), companies(name)")
    .eq("id", id)
    .maybeSingle();
  const place = data as unknown as {
    id: string; company_id: string; branch_id: string; for_branch: boolean; qr_token: string; text_code: string; updated_at: string;
    service_users: { full_name: string } | null; branches: { name: string } | null; companies: { name: string } | null;
  } | null;
  if (!place || place.company_id !== companyId) notFound();

  const link = `${siteUrl()}/c/${place.qr_token}`;
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 1, width: 520, color: { dark: "#000000", light: "#ffffff" } });
  const number = ukMobileFromE164(process.env.TWILIO_FROM ?? null);
  const made = new Date(place.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
  const forWhom = place.for_branch ? `${place.branches?.name ?? "Branch"} office` : place.service_users?.full_name ?? "Home";

  return (
    <main className="min-h-screen bg-gradient-to-b from-navy-950 to-navy-800 p-4 sm:p-8">
      <style>{`@media print { body, main { background: #fff !important; } .no-print { display: none !important; } .sheet { box-shadow: none !important; margin: 0 !important; } @page { margin: 12mm; } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-xl flex-wrap items-center justify-between gap-3">
        <Link href={`/rota/clock?branch=${place.branch_id}`} className="text-sm text-white/70 hover:text-white">
          &larr; Clock in
        </Link>
        <p className="text-sm text-white/70">Sheet for {forWhom}. The name is not printed.</p>
        <PrintButton />
      </div>
      <div className="sheet mx-auto max-w-xl rounded-2xl bg-white p-8 text-center text-black shadow-xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-neutral-500">{place.companies?.name ?? ""}</p>
        <h1 className="mt-2 text-3xl font-bold">Clock in here</h1>
        <p className="mt-2 text-base">Scan this with your phone camera when you arrive and when you leave.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR code to clock in" width={300} height={300} className="mx-auto my-6 h-auto w-72" />
        <div className="rounded-xl border-2 border-black p-4">
          <p className="text-base font-semibold">No smartphone?</p>
          <p className="mt-1 text-base">
            Text <span className="font-mono font-bold">IN {place.text_code}</span> when you arrive and{" "}
            <span className="font-mono font-bold">OUT {place.text_code}</span> when you leave
            {number ? (
              <>
                {" "}to <span className="font-bold">{number}</span>
              </>
            ) : (
              <> to the office text number</>
            )}
            , from your own mobile.
          </p>
        </div>
        <p className="mt-6 text-xs text-neutral-500">Sheet made {made}. If a new sheet is made, this one stops working.</p>
      </div>
    </main>
  );
}
