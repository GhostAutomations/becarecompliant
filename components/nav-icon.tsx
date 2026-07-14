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
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5l2.6-1.5" />
        </svg>
      );
    case "founder":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
          <path d="M14 3v4h4" />
          <path d="M9 13h6M9 16.5h6M9 9.5h2" />
        </svg>
      );
    case "holiday":
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
          <path d="M3.5 9h17M8 3v3M16 3v3" />
          <path d="M8.5 13.5l2 2 4-4" />
        </svg>
      );
    case "absence":
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
          <path d="M3.5 9h17M8 3v3M16 3v3" />
          <path d="M9.5 13l5 4M14.5 13l-5 4" />
        </svg>
      );
    case "training":
      return (
        <svg {...common}>
          <path d="M12 4L2.5 8.5 12 13l9.5-4.5L12 4z" />
          <path d="M6 10.5V15c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5" />
          <path d="M21.5 8.5v5" />
        </svg>
      );
  }
}
