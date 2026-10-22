'use client';
import { useState } from 'react';
// One hue for the measure, a second one only for a loss (below the zero line); colours from
// lib/chartTheme.js.
import { DATA as UP, NEGATIVE as DOWN, GRID, INK, INK_MUTED } from '@/lib/chartTheme';

const monthShort = (ym) => `T${Number(ym.slice(5, 7))}`;

// A small "last 6 months" bar chart under a headline number: this month's value, the change
// against last month, one bar per month (hover / focus a bar for its exact value). Profit can
// go below zero: those bars hang under the baseline in the loss colour.
export default function TrendBars({ title, series, format = (v) => String(v), deltaLabel, noPrevLabel, signed = false }) {
  const [hover, setHover] = useState(null);
  const cur = series[series.length - 1];
  const prev = series[series.length - 2];
  const max = Math.max(1, ...series.map((s) => Math.abs(s.value)));
  const hasNeg = signed && series.some((s) => s.value < 0);
  const W = 260;
  const H = 96;
  const zero = hasNeg ? H / 2 : H; // baseline y
  const span = hasNeg ? H / 2 - 4 : H - 6;
  const slot = W / series.length;
  const bw = Math.min(28, slot - 10);
  const change = prev ? (prev.value === 0 ? null : ((cur.value - prev.value) / Math.abs(prev.value)) * 100) : null;
  const diff = prev ? cur.value - prev.value : null;
  const shown = hover != null ? series[hover] : null;

  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800 p-4 flex flex-col">
      <p className="text-gray-400 text-xs font-semibold">{title}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${signed && cur.value < 0 ? 'text-pink-300' : 'text-white'}`}>{format(cur.value)}</p>
      <p className="text-xs mt-0.5 text-gray-400">
        {prev == null || diff === 0 && prev.value === 0
          ? noPrevLabel
          : (
            <>
              <span className={diff > 0 ? 'text-lime-300' : diff < 0 ? 'text-pink-300' : 'text-gray-300'}>
                {diff > 0 ? '▲' : diff < 0 ? '▼' : '■'} {signed || Math.abs(diff) >= 1000 ? format(Math.abs(diff)) : Math.abs(diff)}
                {change != null && ` (${diff >= 0 ? '+' : '−'}${Math.abs(change).toFixed(0)}%)`}
              </span>{' '}
              {deltaLabel}
            </>
          )}
      </p>
      <div className="relative mt-3">
        <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full h-auto" role="img" aria-label={`${title}: ${series.map((s) => `${monthShort(s.month)} ${format(s.value)}`).join(', ')}`}>
          <line x1="0" x2={W} y1={zero} y2={zero} stroke={GRID} strokeWidth="1" />
          {series.map((s, i) => {
            const h = Math.max(s.value === 0 ? 0 : 2, (Math.abs(s.value) / max) * span);
            const x = i * slot + (slot - bw) / 2;
            const neg = s.value < 0;
            const y = neg ? zero : zero - h;
            const last = i === series.length - 1;
            return (
              <g key={s.month}>
                {/* bigger, invisible hit area */}
                <rect
                  x={i * slot}
                  y="0"
                  width={slot}
                  height={H + 18}
                  fill="transparent"
                  tabIndex={0}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${monthShort(s.month)}: ${format(s.value)}`}
                />
                <rect x={x} y={y} width={bw} height={h} rx="4" fill={neg ? DOWN : UP} opacity={hover == null || hover === i ? 1 : 0.45} pointerEvents="none" />
                <text x={i * slot + slot / 2} y={H + 13} textAnchor="middle" fontSize="11" fill={last ? INK : INK_MUTED} fontWeight={last ? 700 : 400} pointerEvents="none">
                  {monthShort(s.month)}
                </text>
              </g>
            );
          })}
        </svg>
        {shown && (
          <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full rounded-lg border border-navy-600 bg-navy-950 px-2.5 py-1 text-xs text-white shadow-lg whitespace-nowrap">
            <span className="text-gray-400">{shown.month.slice(5, 7)}/{shown.month.slice(0, 4)}:</span> <span className="font-semibold tabular-nums">{format(shown.value)}</span>
            {shown.extra && <span className="text-gray-400"> · {shown.extra}</span>}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>{series.map((s) => <tr key={s.month}><th scope="row">{s.month}</th><td>{format(s.value)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
