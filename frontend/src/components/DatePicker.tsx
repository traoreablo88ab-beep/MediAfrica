// Custom calendar dropdown — replaces native <input type="date">, whose
// popup is drawn by the OS/browser and can't be restyled with CSS. Matches
// the app's palette instead of looking like a bare OS widget.
'use client';

import { useEffect, useRef, useState } from 'react';

const WEEKDAY_LABELS = ['lu', 'ma', 'me', 'je', 've', 'sa', 'di'];

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildGrid(monthAnchor: Date): Date[] {
  const first = startOfMonth(monthAnchor);
  // getDay(): 0=Sunday..6=Saturday → shift so Monday=0..Sunday=6 (French convention).
  const leadingBlanks = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - leadingBlanks);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

export function DatePicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(selected ?? new Date()));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parsed = parseIso(value);
    if (parsed) setMonthAnchor(startOfMonth(parsed));
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

  const today = new Date();
  const days = buildGrid(monthAnchor);
  const monthLabel = monthAnchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-[#e1e0d9] bg-white px-3 py-2 text-left text-sm text-[#0b0b0b] hover:bg-[#f9f9f7] focus:border-[#2a78d6] focus:outline-none"
      >
        {selected
          ? selected.toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : 'Choisir une date'}
      </button>

      {open && (
        <div className="animate-scale-in absolute left-0 z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] origin-top rounded-lg border border-[#e1e0d9] bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold capitalize text-[#0b0b0b]">{monthLabel}</span>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Mois précédent"
                onClick={() =>
                  setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                }
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#52514e] hover:bg-[#f9f9f7]"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Mois suivant"
                onClick={() =>
                  setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                }
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#52514e] hover:bg-[#f9f9f7]"
              >
                ›
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-[#898781]">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const inMonth = d.getMonth() === monthAnchor.getMonth();
              const isSelected = selected ? isSameDay(d, selected) : false;
              const isToday = isSameDay(d, today);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => {
                    onChange(toIso(d));
                    setOpen(false);
                  }}
                  className={`flex h-8 w-8 items-center justify-center rounded-md text-sm ${
                    isSelected
                      ? 'bg-[#2a78d6] font-semibold text-white'
                      : isToday
                        ? 'font-semibold text-[#2a78d6] hover:bg-[#2a78d6]/10'
                        : inMonth
                          ? 'text-[#0b0b0b] hover:bg-[#f9f9f7]'
                          : 'text-[#c5c3bb] hover:bg-[#f9f9f7]'
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-[#e1e0d9] pt-3 text-sm">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="font-medium text-[#2a78d6] hover:underline"
            >
              Effacer
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(toIso(today));
                setMonthAnchor(startOfMonth(today));
                setOpen(false);
              }}
              className="font-medium text-[#2a78d6] hover:underline"
            >
              Aujourd’hui
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
