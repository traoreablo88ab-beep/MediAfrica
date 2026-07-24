// Custom month/year picker — replaces native <input type="month">, whose
// popup is drawn by the OS/browser and can't be restyled (same reasoning as
// DatePicker.tsx). Shows a 12-month grid for a chosen year.
'use client';

import { useEffect, useRef, useState } from 'react';

const MONTH_LABELS = [
  'Janv.',
  'Févr.',
  'Mars',
  'Avr.',
  'Mai',
  'Juin',
  'Juil.',
  'Août',
  'Sept.',
  'Oct.',
  'Nov.',
  'Déc.',
];

function parseMonth(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match || !match[1] || !match[2]) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

function formatMonthValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatLabel(value: string): string {
  const parsed = parseMonth(value);
  if (!parsed) return 'Choisir un mois';
  return new Date(parsed.year, parsed.month - 1, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

export function MonthPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (isoMonth: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseMonth(value);
  const now = new Date();
  const [yearAnchor, setYearAnchor] = useState(selected?.year ?? now.getFullYear());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parsed = parseMonth(value);
    if (parsed) setYearAnchor(parsed.year);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-left text-sm capitalize text-[#0b0b0b] hover:bg-[#f9f9f7] focus:border-[#2a78d6] focus:outline-none"
      >
        {formatLabel(value)}
      </button>

      {open && (
        <div className="animate-scale-in absolute left-0 z-20 mt-1 w-64 max-w-[calc(100vw-2rem)] origin-top rounded-lg border border-[#e1e0d9] bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0b0b0b]">{yearAnchor}</span>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Année précédente"
                onClick={() => setYearAnchor((y) => y - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#52514e] hover:bg-[#f9f9f7]"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Année suivante"
                onClick={() => setYearAnchor((y) => y + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#52514e] hover:bg-[#f9f9f7]"
              >
                ›
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {MONTH_LABELS.map((label, i) => {
              const monthNum = i + 1;
              const isSelected = selected?.year === yearAnchor && selected.month === monthNum;
              const isCurrent = now.getFullYear() === yearAnchor && now.getMonth() + 1 === monthNum;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    onChange(formatMonthValue(yearAnchor, monthNum));
                    setOpen(false);
                  }}
                  className={`rounded-md px-2 py-2 text-sm ${
                    isSelected
                      ? 'bg-[#2a78d6] font-semibold text-white'
                      : isCurrent
                        ? 'font-semibold text-[#2a78d6] hover:bg-[#2a78d6]/10'
                        : 'text-[#0b0b0b] hover:bg-[#f9f9f7]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 border-t border-[#e1e0d9] pt-3 text-sm">
            <button
              type="button"
              onClick={() => {
                onChange(formatMonthValue(now.getFullYear(), now.getMonth() + 1));
                setYearAnchor(now.getFullYear());
                setOpen(false);
              }}
              className="font-medium text-[#2a78d6] hover:underline"
            >
              Mois en cours
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
