'use client';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const fmtMonth = (m) => (m ? `${Number(m.slice(5))}/${m.slice(0, 4)}` : '');
const fmtDay = (d) => (d ? d.split('-').reverse().join('/') : '—');

// One voucher as the player sees it.
export function VoucherChip({ v }) {
  const { t } = useI18n();
  return (
    <li className={`rounded-lg border px-3 py-2 text-sm ${v.state === 'available' ? 'border-lime-400/60 bg-lime-400/10' : 'border-navy-600 opacity-70'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-white font-semibold">{t(`race.reward_${v.kind}`)}</span>
        <span className="text-[11px] text-gray-300">{t(`race.state_${v.state}`)}</span>
      </div>
      <p className="text-xs text-gray-400 mt-0.5">
        Top {v.rank} · {fmtMonth(v.month)}{v.club_name ? ` · ${v.club_name}` : ''} · {v.used_for ? t('race.usedFor', { title: v.used_for.title, date: fmtDay(v.used_for.event_date) }) : t('race.until', { date: fmtDay(v.expires_on) })}
      </p>
    </li>
  );
}

// "Top tháng" tab of a community page: this month's race (names, points) and my vouchers.
export default function RaceBoard({ clubId }) {
  const { t } = useI18n();
  const { data, error } = useLoad(() => api.get(`/api/player/clubs/${clubId}/race`), [clubId]);
  if (error) return <p className="card text-red-300 text-sm">{error.message}</p>;
  if (!data) return <p className="text-gray-400 text-sm">{t('common.loading')}</p>;
  if (!data.enabled) return <p className="card text-gray-400 text-sm">{t('race.notRunning')}</p>;
  const s = data.settings;
  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <h2 className="text-white font-semibold">{t('race.tableTitle', { m: fmtMonth(data.month) })}</h2>
        <p className="text-gray-400 text-xs mt-1">{t('race.playerRules', { c: s.points.checkin, w: s.points.win, n: Math.abs(s.points.no_show), min: s.min_sessions })}</p>
        <p className="text-amber-200 text-xs mt-1">{['1', '2', '3'].filter((r) => s.rewards[r] !== 'none').map((r) => `Top ${r}: ${t(`race.reward_${s.rewards[r]}`)}`).join(' · ')}</p>
      </section>
      {data.groups.map((g) => (
        <section key={g.key || 'all'} className="card !p-0 overflow-x-auto">
          {g.key && <p className="px-4 pt-3 text-xs font-semibold text-gray-300">{t(`race.groupShort_${g.key}`)}</p>}
          {g.rows.length === 0 ? (
            <p className="text-gray-500 text-sm p-4">{t('race.empty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-gray-400 text-xs text-left">
                <tr className="border-b border-navy-700">{['place', 'name', 'sessions', 'wins', 'points'].map((k) => <th key={k} className="px-3 py-2 font-medium">{t(`race.col_${k}`)}</th>)}</tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.place} className={`border-b border-navy-800 last:border-0 tabular-nums ${r.me ? 'bg-lime-400/10' : ''}`}>
                    <td className="px-3 py-2 text-gray-400">{r.prize_rank ? <span className="text-lime-300 font-semibold">{r.prize_rank}</span> : r.place}</td>
                    <td className="px-3 py-2 text-white">{r.full_name}{r.me && <span className="ml-1 text-[11px] text-lime-300">({t('race.you')})</span>}</td>
                    <td className="px-3 py-2">{r.sessions}</td>
                    <td className="px-3 py-2">{r.wins}</td>
                    <td className="px-3 py-2 font-bold text-amber-300">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
      {data.vouchers?.length > 0 && (
        <section className="card">
          <h2 className="text-white font-semibold mb-2">{t('race.myVouchers')}</h2>
          <ul className="flex flex-col gap-2">{data.vouchers.map((v) => <VoucherChip key={v.id} v={v} />)}</ul>
        </section>
      )}
    </div>
  );
}
