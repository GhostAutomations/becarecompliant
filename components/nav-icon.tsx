import type { NavEntry } from "@/lib/nav";

export function NavIcon({
  icon,
  className,
}: {
  icon: NavEntry["icon"];
  className?: string;
}) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  switch (icon) {
    case "dashboard":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "people":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.25" />
          <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M16 14.6c2.6.3 4.5 2 4.5 4.4" />
        </svg>
      );
    case "serviceUsers":
      return (
        <svg {...common}>
          <path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7a4.3 4.3 0 017.5 3.5c0 5.4-7.5 10-7.5 10z" />
          <path d="M8.5 12h2l1-2 1.5 3.5 1-1.5h1.5" />
        </svg>
      );
  }
}
