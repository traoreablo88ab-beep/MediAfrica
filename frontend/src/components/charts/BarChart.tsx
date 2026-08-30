'use client';

// Single-series monthly bar chart — hand-rolled SVG (no charting library),
// following the dataviz skill's mark specs: <=24px bars, 4px rounded top /
// square baseline, hairline gridlines, per-bar hover tooltip, y-axis ticks
// rounded to "nice" numbers. A single series needs no legend box — the
// chart's title (rendered by the caller) already says what's plotted.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

const WIDTH = 760;
const HEIGHT = 220;
const MARGIN = { top: 8, right: 8, bottom: 24, left: 34 };
const GRID = '#e1e0d9';
const AXIS_TEXT = '#898781';
const BAR_MAX_WIDTH = 24;

function niceStep(max: number, targetTicks = 4): number {
  if (max <= 0) return 1;
  const rough = max / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  return step * magnitude;
}

export function BarChart({
  data,
  color = '#2a78d6',
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const plotW = WIDTH - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxValue = Math.max(...data.map((d) => d.value), 0);
  const step = niceStep(maxValue);
  const niceMax = Math.max(Math.ceil(maxValue / step) * step, step);
  const ticks = Array.from({ length: niceMax / step + 1 }, (_, i) => i * step);

  const slot = plotW / data.length;
  const barWidth = Math.min(BAR_MAX_WIDTH, slot * 0.6);

  function yFor(value: number): number {
    return MARGIN.top + plotH - (value / niceMax) * plotH;
  }

  function onMove(e: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const i = Math.min(data.length - 1, Math.max(0, Math.floor((relX - MARGIN.left) / slot)));
    setHovered(i);
  }

  const hoveredDatum = hovered !== null ? data[hovered] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Volumes mensuels"
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

        {data.map((d, i) => {
          const x = MARGIN.left + i * slot + (slot - barWidth) / 2;
          const yTop = yFor(d.value);
          const baseline = MARGIN.top + plotH;
          const barHeight = Math.max(0, baseline - yTop);
          const isHovered = hovered === i;
          return (
            <g key={d.label}>
              {/* Hit target: the full column slot, not just the painted bar. */}
              <rect
                x={MARGIN.left + i * slot}
                y={MARGIN.top}
                width={slot}
                height={plotH}
                fill="transparent"
              />
              {barHeight > 0 && (
                <>
                  <rect
                    x={x}
                    y={yTop}
                    width={barWidth}
                    height={Math.min(4, barHeight)}
                    rx={4}
                    ry={4}
                    fill={color}
                    opacity={isHovered ? 1 : 0.85}
                  />
                  {barHeight > 4 && (
                    <rect
                      x={x}
                      y={yTop + 4}
                      width={barWidth}
                      height={barHeight - 4}
                      fill={color}
                      opacity={isHovered ? 1 : 0.85}
                    />
                  )}
                </>
              )}
              <text
                x={MARGIN.left + i * slot + slot / 2}
                y={HEIGHT - 6}
                textAnchor="middle"
                fontSize={9}
                fill={AXIS_TEXT}
              >
                {d.label}
              </text>
            </g>
          );
        })}

        <line
          x1={MARGIN.left}
          x2={WIDTH - MARGIN.right}
          y1={MARGIN.top + plotH}
          y2={MARGIN.top + plotH}
          stroke="#c3c2b7"
          strokeWidth={1}
        />
      </svg>

      {hoveredDatum && hovered !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-[#e1e0d9] bg-white px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md"
          style={{
            left: `${((hovered + 0.5) / data.length) * 100}%`,
          }}
        >
          <div className="text-[#898781]">{hoveredDatum.label}</div>
          <div className="font-semibold text-[#0b0b0b]">
            {hoveredDatum.value.toLocaleString('fr-FR')}
          </div>
        </div>
      )}
    </div>
  );
}
