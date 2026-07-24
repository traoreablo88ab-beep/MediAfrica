// Shared consultation status badge — used by /dashboard, /patients, and
// /patients/[id] so the four statuses (attente/consultation/traite/urgent)
// always render identically. Icon + colored pill, never color-only text
// (accessibility — see dataviz skill status-palette guidance).
import type { ReactNode } from 'react';

export type ConsultationStatus = 'traite' | 'consultation' | 'attente' | 'urgent';

export const CONSULTATION_STATUS_CONFIG: Record<
  ConsultationStatus,
  { label: string; bg: string; text: string; icon: ReactNode }
> = {
  traite: {
    label: 'Traité',
    bg: 'bg-[#0ca30c]/10',
    text: 'text-[#0ca30c]',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
        <path
          d="M3 8.5 6.5 12 13 4.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  consultation: {
    label: 'En consultation',
    bg: 'bg-[#2a78d6]/10',
    text: 'text-[#2a78d6]',
    icon: <span className="block h-2 w-2 rounded-full bg-current" />,
  },
  attente: {
    label: 'En attente',
    bg: 'bg-[#fab219]/15',
    text: 'text-[#8a5a00]',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 5v3.3l2.2 1.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  urgent: {
    label: 'Urgent',
    bg: 'bg-[#d03b3b]/10',
    text: 'text-[#d03b3b]',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
        <path
          d="M8 1.5 15 14H1L8 1.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M8 6.5v3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="0.9" fill="currentColor" />
      </svg>
    ),
  },
};

export function ConsultationStatusBadge({ status }: { status: ConsultationStatus }) {
  const cfg = CONSULTATION_STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}
