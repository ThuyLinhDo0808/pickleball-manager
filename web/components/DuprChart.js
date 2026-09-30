'use client';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '@/context/I18nContext';

// Same validated series colour as the form chart (dark surface, L 0.48–0.67, >= 3:1).
const LINE = '#72A313';
const SURFACE = '#16223b';
const GRID = '#1e2f4d';
const INK_MUTED = '#9ca3af';

function short(d) {
  const [y, m, day] = d.split('-');
  return `${Number(day)}/${Number(m)}/${y.slice(2)}`;
}

// DUPR changes over time (from the SCD2 history). One series, so no legend.
export default function DuprChart({ data }) {
  const { t } = useI18n();
  // Keep the last value per day, and extend the line to today so the current level is visible.
  const byDay = new Map(data.map((d) => [d.date, d.dupr]));
  const points = [...byDay].map(([date, dupr]) => ({ date, dupr }));
  const today = new Date().toISOString().slice(0, 10);
  if (points.length && points[points.length - 1].date < today) points.push({ date: today, dupr: points[points.length - 1].dupr, extended: true });
  const values = points.map((p) => p.dupr);
  const lo = Math.floor((Math.min(...values) - 0.25) * 4) / 4;
  const hi = Math.ceil((Math.max(...values) + 0.25) * 4) / 4;

  return (
    <>
      <div className="h-40" role="img" aria-label={t('player.dupr')}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
            <XAxis dataKey="date" tickFormatter={short} tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis domain={[lo, hi]} tickFormatter={(v) => v.toFixed(2)} tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              cursor={{ stroke: INK_MUTED, strokeWidth: 1 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="bg-navy-950 border border-navy-600 rounded-lg px-3 py-2 text-xs">
                    <div className="text-white font-semibold">{short(payload[0].payload.date)}</div>
                    <div className="text-gray-300">DUPR {payload[0].payload.dupr.toFixed(2)}</div>
                  </div>
                ) : null
              }
            />
            <Line
              type="stepAfter"
              dataKey="dupr"
              stroke={LINE}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={(p) => (p.payload.extended ? <g key={p.key} /> : <circle key={p.key} cx={p.cx} cy={p.cy} r={4} fill={LINE} stroke={SURFACE} strokeWidth={2} />)}
              activeDot={{ r: 5, fill: LINE, stroke: SURFACE, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{t('player.dupr')}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}><td>{d.date}</td><td>{d.dupr}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
