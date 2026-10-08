"use client";

/**
 * Be Care Compliant — the two ways to send a Briefing, side by side: a policy or a form, or a
 * memo, message or attachment (0435). One panel open at a time.
 */

import { useState } from "react";
import AssignPanel from "@/components/assignments/assign-panel";
import NoticePanel from "@/components/briefings/notice-panel";
import type { BriefingPerson, CompanyPolicy } from "@/lib/assignments/types";
import type { MemoSender } from "@/lib/briefings/senders";

export default function SendBriefing({
  forms,
  policies,
  people,
  senders,
}: {
  forms: Array<{ id: string; name: string }>;
  policies: CompanyPolicy[];
  people: BriefingPerson[];
  senders: MemoSender[];
}) {
  const [open, setOpen] = useState<"policy" | "notice" | null>(null);

  if (open === "policy") {
    return <AssignPanel forms={forms} policies={policies} people={people} onClose={() => setOpen(null)} />;
  }
  if (open === "notice") return <NoticePanel people={people} senders={senders} onClose={() => setOpen(null)} />;
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => setOpen("policy")}>
        Send a policy or a form
      </button>
      <button type="button" className="btn-outline px-3 py-2 text-sm" onClick={() => setOpen("notice")}>
        Send a memo or message
      </button>
    </div>
  );
}
