import { DocType } from "@/lib/templates/types";

interface IconStyle {
  bg: string;
  color: string;
  icon: React.ReactNode;
}

const stroke = {
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const DOC_ICON_STYLES: Record<DocType, IconStyle> = {
  id_card: {
    bg: "#e7f0ff",
    color: "#2f5fdd",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" {...stroke}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <circle cx="8" cy="11" r="2" />
        <path d="M6 16c.5-1.2 1.6-2 3-2s2.5.8 3 2" />
        <line x1="14" y1="10" x2="18" y2="10" />
        <line x1="14" y1="14" x2="18" y2="14" />
      </svg>
    ),
  },
  contract: {
    bg: "#eae9ff",
    color: "#5b53d6",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" {...stroke}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="13" y2="17" />
      </svg>
    ),
  },
  subsidy_application: {
    bg: "#e3f6ec",
    color: "#12805c",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" {...stroke}>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
        <path d="m9 13 2 2 4-4" />
      </svg>
    ),
  },
  cms_autopay: {
    bg: "#f1e8ff",
    color: "#8a4fd8",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" {...stroke}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
        <line x1="6" y1="15" x2="10" y2="15" />
      </svg>
    ),
  },
  power_of_attorney: {
    bg: "#fdeede",
    color: "#d97a1a",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" {...stroke}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
      </svg>
    ),
  },
};
