/**
 * How the founder Invoices page names a Stripe invoice (Phil, 2026-09-30).
 *
 * Stripe's own statuses are draft, open, paid, uncollectible and void. "Open" hides the one
 * thing that matters, whether it is late, so it is split into Due and Overdue by the due date.
 * Pure so node --test runs it.
 */

export type InvoiceLabel = "Paid" | "Due" | "Overdue" | "Draft" | "Void" | "Written off";

export function invoiceLabel(i: {
  status: string | null | undefined;
  dueDate: number | null | undefined; // unix seconds
  nowMs: number;
}): { label: InvoiceLabel; pill: "pill-green" | "pill-amber" | "pill-red" | "pill-neutral" } {
  switch (i.status) {
    case "paid":
      return { label: "Paid", pill: "pill-green" };
    case "draft":
      return { label: "Draft", pill: "pill-neutral" };
    case "void":
      return { label: "Void", pill: "pill-neutral" };
    case "uncollectible":
      return { label: "Written off", pill: "pill-red" };
    default: {
      const overdue = typeof i.dueDate === "number" && i.dueDate * 1000 < i.nowMs;
      return overdue ? { label: "Overdue", pill: "pill-red" } : { label: "Due", pill: "pill-amber" };
    }
  }
}

export type InvoiceFilter = "all" | "unpaid" | "overdue" | "paid";

export function matchesFilter(label: InvoiceLabel, filter: InvoiceFilter): boolean {
  if (filter === "all") return true;
  if (filter === "paid") return label === "Paid";
  if (filter === "overdue") return label === "Overdue";
  return label === "Due" || label === "Overdue";
}
