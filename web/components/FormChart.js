'use client';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '@/context/I18nContext';

// Validated for the dark card surface (#16223b): OKLCH L inside 0.48–0.67, contrast >= 3:1.
// The brand lime (#B6F03B) is too light to carry data on this surface.
const BAR = '#72A313';
const GRID = '#1e2f4d';
const INK_MUTED = '#9ca3af';

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${Number(m)}/${y.slice(2)}`;
}

function Tip({ active, payload, t }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-navy-950 border border-navy-600 rounded-lg px-3 py-2 text-xs shadow-lg">
      <div className="text-white font-semibold mb-1">{monthLabel(d.month)}</div>
      <div className="text-gray-300">{t('player.winRate')}: <span className="text-white">{d.win_rate}%</span></div>
      <div className="text-gray-400">{t('player.wins')} {d.wins}/{d.matches} {t('player.matches').toLowerCase()}</div>
    </div>
  );
}

// Win rate per month — one series, so no legend: the card title names it.
export default function FormChart({ data }) {
  const { t } = useI18n();
  return (
    <>
      <div className="h-48" role="img" aria-label={t('player.form')}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
            <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<Tip t={t} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="win_rate" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Same numbers as a table for screen readers. */}
      <table className="sr-only">
        <caption>{t('player.form')}</caption>
        <thead>
          <tr><th>Month</th><th>{t('player.matches')}</th><th>{t('player.wins')}</th><th>{t('player.winRate')}</th></tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}><td>{d.month}</td><td>{d.matches}</td><td>{d.wins}</td><td>{d.win_rate}%</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
