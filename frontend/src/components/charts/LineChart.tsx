'use client';

// Multi-series (year-over-year) monthly trend chart — hand-rolled SVG,
// same margin/scale system as BarChart. 2px lines, >=8px end markers with a
// 2px surface ring, a crosshair that snaps to the nearest month, one
// tooltip listing every series at that month, and a legend (mandatory for
// >=2 series per the dataviz skill). Direct end-labels are skipped when the
// two series end within a few px of each other — the legend + tooltip
// still carry identity, per the "don't stack colliding labels" rule.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

const WIDTH = 760;
const HEIGHT = 220;
const MARGIN = { top: 8, right: 44, bottom: 24, left: 34 };
const SURFACE = '#fcfcfb';
const GRID = '#e1e0d9';
const AXIS_TEXT = '#898781';
const END_LABEL_COLLISION_PX = 14;

function niceStep(max: number, targetTicks = 4): number {
  if (max <= 0) return 1;
  const rough = max / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  return step * magnitude;
}

interface LineSeries {
  key: string;
  label: string;
  color: string;
  data: { label: string; value: number }[];
}

export function LineChart({ series }: { series: LineSeries[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const monthCount = series[0]?.data.length ?? 0;
  const plotW = WIDTH - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxValue = Math.max(...series.flatMap((s) => s.data.map((d) => d.value)), 0);
  const step = niceStep(maxValue);
  const niceMax = Math.max(Math.ceil(maxValue / step) * step, step);
  const ticks = Array.from({ length: niceMax / step + 1 }, (_, i) => i * step);

  function xFor(i: number): number {
    return monthCount <= 1 ? MARGIN.left : MARGIN.left + (i / (monthCount - 1)) * plotW;
  }
  function yFor(value: number): number {
    return MARGIN.top + plotH - (value / niceMax) * plotH;
  }

  function onMove(e: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || monthCount === 0) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const slot = plotW / monthCount;
    const i = Math.min(monthCount - 1, Math.max(0, Math.floor((relX - MARGIN.left) / slot)));
    setHovered(i);
  }

  const endYs = series.map((s) => yFor(s.data[s.data.length - 1]?.value ?? 0));
  const endLabelsCollide =
    endYs.length > 1 && Math.abs((endYs[0] ?? 0) - (endYs[1] ?? 0)) < END_LABEL_COLLISION_PX;

  return (
    <div className="relative">
      {series.length >= 2 && (
        <div className="mb-2 flex flex-wrap gap-4">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs text-[#52514e]">
              <span
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </div>
          ))}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Évolution mensuelle"
        onPointerMove={onMove}
        onPointerLeave={() => setHovered(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={yFor(t)}
              y2={yFor(t)}
              stroke={GRID}
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 6}
              y={yFor(t)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={9}
              fill={AXIS_TEXT}
            >
              {t.toLocaleString('fr-FR')}
            </text>
          </g>
        ))}

        {(series[0]?.data ?? []).map((d, i) => (
          <text
            key={d.label}
            x={xFor(i)}
            y={HEIGHT - 6}
            textAnchor="middle"
            fontSize={9}
            fill={AXIS_TEXT}
          >
            {d.label}
          </text>
        ))}

        <line
          x1={MARGIN.left}
          x2={WIDTH - MARGIN.right}
          y1={MARGIN.top + plotH}
          y2={MARGIN.top + plotH}
          stroke="#c3c2b7"
          strokeWidth={1}
        />

        {hovered !== null && (
          <line
            x1={xFor(hovered)}
            x2={xFor(hovered)}
            y1={MARGIN.top}
            y2={MARGIN.top + plotH}
            stroke="#c3c2b7"
            strokeWidth={1}
          />
        )}

        {series.map((s) => {
          const points = s.data.map((d, i) => `${xFor(i)},${yFor(d.value)}`).join(' ');
          const last = s.data[s.data.length - 1];
          const showEndLabel = !endLabelsCollide;
          return (
            <g key={s.key}>
              <polyline
                points={points}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {last && (
                <circle
                  cx={xFor(s.data.length - 1)}
                  cy={yFor(last.value)}
                  r={5}
                  fill={s.color}
                  stroke={SURFACE}
                  strokeWidth={2}
                />
              )}
              {last && showEndLabel && (
                <text
                  x={xFor(s.data.length - 1) + 8}
                  y={yFor(last.value)}
                  dominantBaseline="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="#0b0b0b"
                >
                  {last.value.toLocaleString('fr-FR')}
                </text>
              )}
              {hovered !== null && s.data[hovered] && (
                <circle
                  cx={xFor(hovered)}
                  cy={yFor(s.data[hovered]!.value)}
                  r={4}
                  fill={s.color}
                  stroke={SURFACE}
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}
      </svg>

      {hovered !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-[#e1e0d9] bg-white px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md"
          style={{ left: `${(xFor(hovered) / WIDTH) * 100}%` }}
        >
          <div className="mb-1 text-[#898781]">{series[0]?.data[hovered]?.label}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-3 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="font-semibold text-[#0b0b0b]">
                {(s.data[hovered]?.value ?? 0).toLocaleString('fr-FR')}
              </span>
              <span className="text-[#898781]">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
