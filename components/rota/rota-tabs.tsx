import Link from "next/link";

/** The Rota's views, kept on the same branch. */
export default function RotaTabs({ active, branchId }: { active: "week" | "visits" | "calls" | "clock" | "templates" | "availability"; branchId: string }) {
  const tabs = [
    { key: "week", label: "Week", href: `/rota?branch=${branchId}` },
    { key: "visits", label: "Visits", href: `/rota/visits?branch=${branchId}` },
    { key: "calls", label: "Call times", href: `/rota/calls?branch=${branchId}` },
    { key: "clock", label: "Clock in", href: `/rota/clock?branch=${branchId}` },
    { key: "templates", label: "Templates", href: `/rota/templates?branch=${branchId}` },
    { key: "availability", label: "Availability", href: `/rota/availability?branch=${branchId}` },
  ] as const;
  return (
    <nav aria-label="Rota" className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={`btn px-3 py-1.5 text-xs ${t.key === active ? "btn-primary" : "btn-ghost"}`} aria-current={t.key === active ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
