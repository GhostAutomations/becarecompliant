"use client";

/**
 * Be Care Compliant — the Service User register (Phase 4). Same interaction model as
 * the People register: the server loads EVERY Service User once (all statuses, all
 * the viewer's branches); this component switches Branches and View (Main / Hospital
 * / Respite / Cancelled) by filtering on the client, so those changes are instant
 * with no server round trip. Summary is a separate page, so that option navigates.
 * The URL is kept in sync for refresh/back.
 *
 * The table is a fixed set of review columns (not a per-check matrix): Service User,
 * Package Start Date, SSID, Status, Most Recent Review, New Review Due, Planned
 * Review Date, Review Status. Risk assessment, MAR audit and consent review live in
 * the record drill-down.
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NavIcon } from "@/components/nav-icon";
import { PillSelect, toneClass, type Tone } from "@/components/register/pill-select";
import { HorizontalScrollbar } from "@/components/register/horizontal-scrollbar";
import PlannedReviewCell from "./planned-review-cell";
import { setServiceStatus } from "@/lib/service-users/actions";
import { formatDisplayDate, reviewStatus } from "@/lib/service-users/logic";
import {
  type ServiceUserRow,
  type ServiceStatus,
  type ReviewStatus,
  SERVICE_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/lib/service-users/types";
import type { BranchLite, ProfileLite } from "@/lib/service-users/data";

const RAG_ORDER: Record<string, number> = { red: 0, amber: 1, green: 2, none: 3 };

function serviceStatusTone(v: string | null): Tone {
  if (v === "active") return "green";
  if (v === "hospital" || v === "respite") return "amber";
  if (v === "cancelled") return "red";
  return "neutral";
}

function reviewStatusTone(v: ReviewStatus): Tone {
  if (v === "overdue") return "red";
  if (v === "booked") return "green";
  return "neutral";
}

/** Toast shown when a Status change moves a Service User to another view. */
const STATUS_MOVE: Record<string, string> = {
  active: "Moved to Main",
  hospital: "Moved to Hospital",
  respite: "Moved to Respite",
  cancelled: "Moved to Cancelled",
  archive: "Moved to Archive",
};

const SERVICE_STATUS_OPTIONS = (Object.keys(SERVICE_STATUS_LABELS) as ServiceStatus[]).map((k) => ({
  value: k,
  label: SERVICE_STATUS_LABELS[k],
}));

function ragClass(rag: string): string {
  return rag === "red"
    ? "rag-cell-red"
    : rag === "amber"
      ? "rag-cell-amber"
      : rag === "green"
        ? "rag-cell-green"
        : "rag-cell-none";
}

function RagDate({ date, rag }: { date: string | null; rag: string }) {
  if (!date) return <span className="rag-cell rag-cell-none">—</span>;
  return <span className={`rag-cell ${ragClass(rag)}`}>{formatDisplayDate(date)}</span>;
}

const VIEW_META: Record<string, { title: string; match: (r: ServiceUserRow) => boolean }> = {
  main: { title: "Service Users", match: (r) => r.service_user.service_status === "active" && !r.service_user.archived_at },
  hospital: { title: "Hospital", match: (r) => r.service_user.service_status === "hospital" && !r.service_user.archived_at },
  respite: { title: "Respite", match: (r) => r.service_user.service_status === "respite" && !r.service_user.archived_at },
  cancelled: { title: "Cancelled", match: (r) => r.service_user.service_status === "cancelled" && !r.service_user.archived_at },
};

export default function ServiceUserRegister({
  rows,
  branches,
  reviewers,
  columnLabels,
  canManage,
  initialView,
  initialBranch,
}: {
  rows: ServiceUserRow[];
  branches: BranchLite[];
  reviewers: ProfileLite[];
  columnLabels: Record<string, string>;
  canManage: boolean;
  initialView: string;
  initialBranch: string;
}) {
  const router = useRouter();
  const [view, setView] = useState(VIEW_META[initialView] ? initialView : "main");
  const [branchId, setBranchId] = useState(initialBranch);
  const [search, setSearch] = useState("");
  const [worstFirst, setWorstFirst] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Service Users are only ever assigned to a branch, never the office (team), so
  // the office is excluded from the Branches dropdown.
  const branchOptions = branches.filter((b) => b.kind === "branch");
  const meta = VIEW_META[view];
  const col = (key: string, def: string) => columnLabels[key] || def;
  const statusOptions =
    view === "cancelled" ? [...SERVICE_STATUS_OPTIONS, { value: "archive", label: "Archive" }] : SERVICE_STATUS_OPTIONS;

  function urlFor(v: string, b: string) {
    const params = new URLSearchParams();
    if (v !== "main") params.set("view", v);
    if (b) params.set("branch", b);
    const qs = params.toString();
    return `/service-users${qs ? `?${qs}` : ""}`;
  }
  const returnTo = urlFor(view, branchId);
  const fromQuery = `?from=${encodeURIComponent(returnTo)}`;

  function changeView(v: string) {
    if (v === "summary") {
      router.push(branchId ? `/service-users/summary?branch=${branchId}` : "/service-users/summary");
      return;
    }
    setView(v);
    window.history.replaceState(null, "", urlFor(v, branchId));
  }

  function changeBranch(b: string) {
    setBranchId(b);
    window.history.replaceState(null, "", urlFor(view, b));
  }

  const filtered = useMemo(() => {
    let list = rows.filter((r) => (!branchId || r.service_user.branch_id === branchId) && meta.match(r));
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (r) =>
          r.service_user.full_name.toLowerCase().includes(term) ||
          (r.service_user.ssid ?? "").toLowerCase().includes(term),
      );
    }
    if (worstFirst) {
      list = [...list].sort(
        (a, b) => (RAG_ORDER[a.rollup?.rag ?? "none"] ?? 3) - (RAG_ORDER[b.rollup?.rag ?? "none"] ?? 3),
      );
    }
    return list;
  }, [rows, branchId, meta, search, worstFirst]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="page-title">{meta.title}</h1>
        {canManage && view === "main" ? (
          <Link href="/service-users/new" className="btn-primary">Add service user</Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {branchOptions.length > 1 ? (
          <label className="flex items-center gap-2 text-sm font-bold text-white">
            Branches
            <select className="inline-cell" value={branchId} onChange={(e) => changeBranch(e.target.value)}>
              <option value="">All branches</option>
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex items-center gap-2 text-sm font-bold text-white">
          View
          <select className="inline-cell" value={view} onChange={(e) => changeView(e.target.value)}>
            <option value="main">Main</option>
            <option value="summary">Summary</option>
            <option value="hospital">Hospital</option>
            <option value="respite">Respite</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <div className="glass-card flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400/10 text-gold-400">
              <NavIcon icon="serviceUsers" className="h-6 w-6" />
            </span>
            {view === "main" ? (
              <>
                <h2 className="text-base font-semibold text-white">No Service User records yet</h2>
                <p className="max-w-md text-sm text-white/60">
                  Add your first service user and their care plan review, risk assessment,
                  medication audit and consent review are scheduled automatically.
                </p>
                {canManage ? (
                  <Link href="/service-users/new" className="btn-primary mt-2">Add your first service user</Link>
                ) : null}
              </>
            ) : (
              <h2 className="text-base font-semibold text-white">No {meta.title.toLowerCase()} to show</h2>
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Search service users"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
                aria-label="Search service users"
              />
              <button
                type="button"
                className={worstFirst ? "btn-primary" : "btn-outline"}
                onClick={() => setWorstFirst((v) => !v)}
              >
                {worstFirst ? "Sorted by status" : "Sort by status"}
              </button>
              <span className="ml-auto text-xs text-white/50">
                {filtered.length} {filtered.length === 1 ? "record" : "records"}
              </span>
            </div>

            <div ref={wrapRef} className="matrix-wrap min-h-0 flex-1">
              <table className="matrix">
                <thead>
                  <tr>
                    <th className="col-carer">Service User</th>
                    <th>{col("ssid", "SSID")}</th>
                    <th>{col("status", "Status")}</th>
                    <th>{col("package_start_date", "Package Start Date")}</th>
                    <th>{col("setup_due", "Setup Due")}</th>
                    <th>{col("setup_completed", "Setup Completed")}</th>
                    <th>{col("most_recent_review", "Most Recent Review")}</th>
                    <th>{col("new_review_due", "New Review Due")}</th>
                    <th>{col("planned_review_date", "Planned Review Date")}</th>
                    <th>{col("review_status", "Review Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const su = row.service_user;
                    const review = row.statusByKey["care_plan_review"];
                    const setup = row.statusByKey["setup"];
                    const setupDue = setup?.due_date ?? null;
                    const setupComp = setup?.last_completed_on ?? null;
                    // Completed on time (green) when the completion is on or before the
                    // due date, otherwise late (red).
                    const setupLate = !!setupComp && !!setupDue && setupComp > setupDue;
                    const newReviewDue = review?.due_date ?? null;
                    const planned = row.tracker?.planned_review_date ?? null;
                    const rs = reviewStatus(newReviewDue, planned);
                    return (
                      <tr key={su.id}>
                        <td className="col-carer">
                          <Link
                            href={`/service-users/${su.id}${fromQuery}`}
                            className="font-semibold text-white hover:text-gold-300"
                          >
                            {su.full_name}
                          </Link>
                        </td>
                        <td><span className="text-white/70">{su.ssid || "—"}</span></td>
                        <td>
                          {canManage ? (
                            <PillSelect
                              recordId={su.id}
                              recordField="service_user_id"
                              field="status"
                              value={su.service_status}
                              options={statusOptions}
                              action={setServiceStatus}
                              toneOf={serviceStatusTone}
                              moveToast={STATUS_MOVE}
                            />
                          ) : (
                            <span className={toneClass(serviceStatusTone(su.service_status))}>
                              {SERVICE_STATUS_LABELS[su.service_status]}
                            </span>
                          )}
                        </td>
                        <td><span className="text-white/70">{formatDisplayDate(su.package_start_date) || "—"}</span></td>
                        <td>
                          {setupComp ? (
                            <span className="text-white/70">{formatDisplayDate(setupDue) || "—"}</span>
                          ) : (
                            <RagDate date={setupDue} rag={setup?.rag ?? "none"} />
                          )}
                        </td>
                        <td>
                          {setupComp ? (
                            <span className={`rag-cell ${setupLate ? "rag-cell-red" : "rag-cell-green"}`}>
                              {formatDisplayDate(setupComp)}
                            </span>
                          ) : (
                            <span className="rag-cell rag-cell-none">—</span>
                          )}
                        </td>
                        <td><span className="text-white/70">{formatDisplayDate(review?.last_completed_on ?? null) || "—"}</span></td>
                        <td><RagDate date={newReviewDue} rag={review?.rag ?? "none"} /></td>
                        <td>
                          <PlannedReviewCell
                            serviceUserId={su.id}
                            plannedDate={planned}
                            reviewerId={row.tracker?.planned_reviewer_id ?? null}
                            reviewerName={row.tracker?.planned_reviewer_name ?? null}
                            reviewers={reviewers}
                            editable={canManage}
                          />
                        </td>
                        <td><span className={toneClass(reviewStatusTone(rs))}>{REVIEW_STATUS_LABELS[rs]}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <HorizontalScrollbar targetRef={wrapRef} />
          </div>
        )}
      </div>
    </div>
  );
}
