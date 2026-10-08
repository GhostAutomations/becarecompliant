import "server-only";

/**
 * Be Care Compliant — draw a memo's PDF (0435). The notice is read through the CALLER's RLS
 * client first, so only someone allowed to see the notice gets its PDF; the letterhead and the
 * sender's name are then read with the service role, pinned to that notice's company.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getCompanyLogoDataUrl } from "@/lib/invoicing/logo";
import { officeAddress, resolveBranchAddress, type BranchAddressRow } from "@/lib/branches/office-address";
import { addressLines, letterDate } from "@/lib/absence/invitation-letter";
import { ROLE_LABELS } from "@/lib/nav";
import { renderMemoPdf } from "@/lib/briefings/memo-pdf";
import { parseNoticeText } from "@/lib/briefings/notice-text";

export type NoticeForCaller = {
  id: string;
  company_id: string;
  kind: string;
  title: string;
  body: string | null;
  files: unknown;
  response: string;
  created_by: string | null;
  created_at: string;
  from_name: string | null;
  from_role: string | null;
};

/** The notice, if the caller may see it. */
export async function noticeForCaller(noticeId: string): Promise<NoticeForCaller | null> {
  if (!/^[0-9a-f-]{36}$/i.test(noticeId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("briefing_notices")
    .select("id, company_id, kind, title, body, files, response, created_by, created_at, from_name, from_role")
    .eq("id", noticeId)
    .maybeSingle();
  return (data as NoticeForCaller | null) ?? null;
}

/** The company letterhead and how the sender signs a memo. */
async function memoParts(companyId: string, senderId: string | null) {
  const admin = createServiceClient();
  const [{ data: company }, { data: branches }, { data: sender }, { data: senderPerson }, logoDataUrl] =
    await Promise.all([
      admin.from("companies").select("name").eq("id", companyId).maybeSingle(),
      admin.from("branches").select("id, name, kind, address, phone, uses_office_address").eq("company_id", companyId),
      senderId
        ? admin.from("profiles").select("full_name, role").eq("id", senderId).maybeSingle()
        : Promise.resolve({ data: null }),
      senderId
        ? admin.from("people").select("job_title").eq("company_id", companyId).eq("profile_id", senderId).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
      getCompanyLogoDataUrl(companyId).catch(() => null),
    ]);
  const rows = (branches ?? []) as (BranchAddressRow & { phone: string | null })[];
  const office = rows.find((b) => b.kind === "team") ?? null;
  const headAddress = office ? resolveBranchAddress(office, officeAddress(rows)).address : officeAddress(rows);
  const companyName = (company?.name as string | null) ?? "Your company";
  const senderName = (sender as { full_name?: string } | null)?.full_name ?? companyName;
  const jobTitle = ((senderPerson as { job_title?: string | null } | null)?.job_title ?? "").trim();
  const role = (sender as { role?: string } | null)?.role ?? "";
  const senderRole = jobTitle || ROLE_LABELS[role] || "";
  return {
    companyName,
    logoDataUrl,
    letterheadLines: addressLines(headAddress),
    phoneLines: String(office?.phone ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    from: senderRole ? `${senderName}, ${senderRole}` : senderName,
  };
}

export async function renderNoticeMemo(
  notice: NoticeForCaller,
  callerProfileId: string,
): Promise<Buffer> {
  const admin = createServiceClient();
  const [parts, { data: mine }] = await Promise.all([
    memoParts(notice.company_id, notice.created_by),
    // Opened by somebody it was sent to: it is addressed to them.
    admin
      .from("assignments")
      .select("people:person_id!inner(full_name, profile_id)")
      .eq("notice_id", notice.id)
      .eq("people.profile_id", callerProfileId)
      .limit(1)
      .maybeSingle(),
  ]);
  const recipient = (() => {
    const p = (mine as { people?: { full_name: string } | { full_name: string }[] } | null)?.people;
    return (Array.isArray(p) ? p[0] : p)?.full_name ?? null;
  })();
  const files = Array.isArray(notice.files) ? (notice.files as Array<{ name?: string }>) : [];
  return renderMemoPdf({
    ...parts,
    // Sent on someone else's behalf (0436): it is from them, as frozen when it was sent.
    ...(notice.from_name ? { from: notice.from_role ? `${notice.from_name}, ${notice.from_role}` : notice.from_name } : {}),
    to: recipient ?? "The team",
    date: letterDate(notice.created_at.slice(0, 10)),
    subject: notice.title,
    blocks: parseNoticeText(notice.body),
    attachments: files.map((f) => String(f.name ?? "File")),
  });
}

/** A memo not yet sent, exactly as it will look (Phil, 2026-10-08: "so we can see what it's
 *  sending so it doesn't look trash"). Nothing is saved. */
export async function renderMemoPreview(opts: {
  companyId: string;
  senderId: string;
  title: string;
  body: string;
  fileNames: string[];
  todayIso: string;
  /** "Jane Smith, Registered Manager" when it is being sent on their behalf. */
  from?: string | null;
}): Promise<Buffer> {
  const parts = await memoParts(opts.companyId, opts.senderId);
  return renderMemoPdf({
    ...parts,
    ...(opts.from ? { from: opts.from } : {}),
    to: "The team",
    date: letterDate(opts.todayIso),
    subject: opts.title,
    blocks: parseNoticeText(opts.body),
    attachments: opts.fileNames,
    preview: true,
  });
}
