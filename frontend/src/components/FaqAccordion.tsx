'use client';

import { useState } from 'react';

interface FaqItem {
  q: string;
  a: string;
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.q} className="overflow-hidden rounded-xl border border-[#e1e0d9] bg-white">
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span className="text-sm font-semibold text-[#0b0b0b] sm:text-base">{item.q}</span>
              <span
                className="shrink-0 text-lg text-[#2a78d6] transition-transform duration-200"
                style={{ transform: open ? 'rotate(45deg)' : 'none' }}
                aria-hidden="true"
              >
                +
              </span>
            </button>
            {open && <p className="px-5 pb-4 text-sm leading-relaxed text-[#52514e]">{item.a}</p>}
          </div>
        );
      })}
    </div>
  );
}
