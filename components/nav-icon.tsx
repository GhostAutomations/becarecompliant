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
    case "complaints":
      return (
        <svg {...common}>
          <path d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1H9l-4 4V6a1 1 0 011-1z" />
          <path d="M12 8.5v3M12 13.3h.01" />
        </svg>
      );
    case "invoicing":
      return (
        <svg {...common}>
          <path d="M6 3h9l3 3v14.5l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2V4a1 1 0 011-1z" />
          <path d="M9 8h6M9 11.5h6M9 15h3" />
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
    case "compliance":
      return (
        <svg {...common}>
          <path d="M9 4h6a1 1 0 011 1v1h1a1 1 0 011 1v12a1 1 0 01-1 1H6a1 1 0 01-1-1V7a1 1 0 011-1h1V5a1 1 0 011-1z" />
          <path d="M9 5.5h6" />
          <path d="M8.5 12.5l2 2 4-4.5" />
        </svg>
      );
    case "outcomes":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="0.8" fill="currentColor" />
        </svg>
      );
    case "satisfaction":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M8.5 14c.9 1.4 2.1 2.1 3.5 2.1s2.6-.7 3.5-2.1" />
          <path d="M9 9.5h.01M15 9.5h.01" />
        </svg>
      );
    case "planner":
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
          <path d="M3.5 9h17M8 3v3M16 3v3" />
          <path d="M12 12v2.5l1.6 1" />
        </svg>
      );
    case "whiteboard":
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="17" height="13" rx="1.5" />
          <path d="M12 17.5v3M9 20.5h6" />
          <path d="M7 8.5h4M7 12h7" />
        </svg>
      );
  }
}
