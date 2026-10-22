'use client';
import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import Hint from '@/components/ui/Hint';
import { Top10Checks, Top10Verdict } from '@/components/Top10';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { todayYmd } from '@/lib/dates';

const dmy = (d) => (d ? d.split('-').reverse().join('/') : '—');
const fmtMonth = (m) => `${Number(m.slice(5))}/${m.slice(0, 4)}`;

// The period picker: this month and the 11 before, this year, everything.
function PeriodSelect({ value, onChange, t }) {
  const now = todayYmd();
  const months = Array.from({ length: 12 }, (_, k) => {
    const d = new Date(Number(now.slice(0, 4)), Number(now.slice(5, 7)) - 1 - k, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  return (
    <select className="input !w-auto text-sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('biz.period')}>
      {months.map((m) => <option key={m} value={m}>{t('biz.month', { m: fmtMonth(m) })}</option>)}
      <option value={now.slice(0, 4)}>{t('biz.year', { y: now.slice(0, 4) })}</option>
      <option value="all">{t('biz.allTime')}</option>
    </select>
  );
}

// Social Manager → Thống kê: business numbers only (players + money), no attendance grid.
export default function CommunityBusiness({ view = 'players' }) {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const [period, setPeriod] = useState(todayYmd().slice(0, 7));
  const { data, error } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/business?period=${period}`) : Promise.resolve(null)), [club?.id, period]);
  const { data: members } = useLoad(() => (club && view === 'players' ? api.get(`/api/clubs/${club.id}/members`) : Promise.resolve(null)), [club?.id, view]);
  const vips = (members || []).filter((m) => m.membership_state === 'active').sort((a, b) => (b.vip_stars || 0) - (a.vip_stars || 0) || a.full_name.localeCompare(b.full_name, 'vi'));
  const p = data?.players;
  const m = data?.money;
  const newest = p?.new_by_month?.at(-1);
  const peak = Math.max(1, ...(p?.new_by_month || []).map((x) => x.n));
  const rep = data?.reputation;
  const bar = (k) => rep?.checks.find((c) => c.key === k);
  const share = (n) => (p?.total ? Math.round((1000 * n) / p.total) / 10 : 0);
  const [missing, setMissing] = useState(false);

  return (
    <AppShell>
      <PageHeader icon={view === 'players' ? '📈' : '💰'} title={t(view === 'players' ? 'nav.bizPlayers' : 'nav.bizMoney')} subtitle={club?.name} actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Phân tích tài chính (add-on 💎) lives here, not in the side menu. */}
          {view === 'money' && <Link href="/club/insights" className="btn-secondary text-sm whitespace-nowrap">🔬 {t('nav.finAnalysis')} 💎</Link>}
          <PeriodSelect value={period} onChange={setPeriod} t={t} />
        </div>
      } />
      <SectionTabs group="stats" />
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}

      {view === 'players' && p && (
        <>
          <KpiRow cols={4}>
            <StatTile icon="👥" label={t('biz.total')} value={rep ? `${p.total}/${rep.thresholds.members}` : p.total} sub={rep ? t('biz.totalProgress', { pct: Math.round(bar('members').progress) }) : t('biz.totalSub')} />
            <StatTile icon="🌱" label={t('biz.newMonth')} value={newest?.n ?? 0} tone="text-emerald-300" sub={t('biz.shareSub', { pct: share(newest?.n || 0), month: newest ? fmtMonth(newest.month) : '' })} />
            <StatTile icon="🏠" label={t('biz.regular')} value={p.regular} tone="text-lime-300" sub={t('biz.shareTotal', { pct: share(p.regular) })} />
            <StatTile icon="🤝" label={t('biz.dropin')} value={p.dropin} tone="text-sky-300" sub={t('biz.shareTotal', { pct: share(p.dropin) })} />
            <StatTile icon="⭐" label={t('biz.vip')} value={vips.length} tone="text-amber-300" />
            <StatTile icon="📅" label={t('biz.sessionsMonth')} value={bar('sessions')?.value ?? '—'} sub={rep ? t('biz.sessionsMonthSub', { n: rep.months }) : ''} />
            <StatTile icon="↩️" label={t('biz.returnRate')} value={p.return_rate == null ? '—' : `${p.return_rate}%`} tone="text-violet-300" sub={t('biz.returnSub', { back: p.came_back, all: p.played_once })} />
          </KpiRow>
          <Hint text={t('biz.playersHint')} className="mb-4" />

          {rep && (
            <section className="card mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-white font-semibold">🏆 {t('top10.cardTitle')}</h2>
                <Link href="/contact?top10=1" onClick={(e) => { if (!rep.eligible) { e.preventDefault(); setMissing(true); } }} className="btn-primary text-sm max-sm:w-full text-center">{t('top10.registerBtn')}</Link>
              </div>
              <Top10Checks reputation={rep} />
              <div className="mt-3"><Top10Verdict reputation={rep} /></div>
              {missing && !rep.eligible && (
                <div className="mt-2 rounded-xl border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm text-red-100" role="alert">
                  <p className="font-semibold">✕ {t('top10.notEligible')}</p>
                  <ul className="list-disc pl-5 mt-1">{rep.failing.map((k) => <li key={k}>{t(`top10.c_${k}`)} · {t(`top10.need_${k}`, { n: bar(k)?.target })}</li>)}</ul>
                </div>
              )}
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card">
              <h2 className="text-white font-semibold mb-3">🌱 {t('biz.newByMonth')}</h2>
              <div className="flex items-end gap-2 h-36" role="img" aria-label={(p.new_by_month || []).map((x) => `${fmtMonth(x.month)}: ${x.n}`).join(', ')}>
                {p.new_by_month.map((x) => (
                  <div key={x.month} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${fmtMonth(x.month)}: ${x.n}`}>
                    <span className="text-xs text-gray-200 tabular-nums">{x.n}</span>
                    <div className="w-full rounded-t-md bg-emerald-400/80" style={{ height: `${(x.n / peak) * 80}%`, minHeight: x.n ? 4 : 0 }} />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-1">{p.new_by_month.map((x) => <span key={x.month} className="flex-1 text-center text-[11px] text-gray-400">{x.month.slice(5)}/{x.month.slice(2, 4)}</span>)}</div>
            </section>

            <section className="card">
              <h2 className="text-white font-semibold mb-2">⭐ {t('biz.vipList')} ({vips.length})</h2>
              {vips.length === 0 ? (
                <p className="text-gray-500 text-sm">{t('biz.noVip')}</p>
              ) : (
                <ul className="divide-y divide-navy-700 text-sm">
                  {vips.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="text-white break-words min-w-0">{v.full_name} <span className="text-amber-300">{'⭐'.repeat(v.vip_stars || 1)}</span></span>
                      <span className="text-gray-400 text-xs shrink-0">{v.sessions_unlimited ? t('biz.unlimited') : v.sessions_remaining != null ? t('biz.left', { n: v.sessions_remaining }) : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {view === 'money' && m && (
        <>
          <KpiRow cols={4}>
            <StatTile icon="📊" label={t('biz.revenue')} value={formatVnd(m.revenue)} sub={t('biz.revenueSub')} />
            <StatTile icon="💚" label={t('biz.income')} value={formatVnd(m.income)} tone="text-lime-400" />
            <StatTile icon="🧾" label={t('biz.expense')} value={formatVnd(m.expense)} tone="text-orange-300" />
            <StatTile icon="⚖️" label={t('biz.profit')} value={formatVnd(m.profit)} tone={m.profit < 0 ? 'text-red-400' : 'text-white'} sub={t('biz.profitSub')} />
          </KpiRow>
          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <section className="card">
              <h2 className="text-white font-semibold mb-2">🧾 {t('biz.expenseBy')}</h2>
              <ul className="text-sm divide-y divide-navy-700">
                {['court', 'water', 'balls', 'other'].map((k) => (
                  <li key={k} className="flex justify-between py-1.5">
                    <span className="text-gray-300">{t(`biz.cat_${k}`)}</span>
                    <span className="text-orange-300 tabular-nums">{formatVnd(m.by_category[k] || 0)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card">
              <h2 className="text-white font-semibold mb-2">🎾 {t('biz.balls')}</h2>
              {(data.balls || []).length === 0 ? (
                <p className="text-gray-500 text-sm">{t('biz.noBalls')} <Link href="/finance/inventory" className="text-lime-300 underline">{t('biz.toInventory')}</Link></p>
              ) : (
                <ul className="text-sm divide-y divide-navy-700">
                  {data.balls.map((b) => (
                    <li key={b.id} className="py-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="text-white">{b.name}{b.holes ? ` · ${t('inventory.holesN', { n: b.holes })}` : ''}</span>
                        <span className="text-lime-300 font-semibold">{b.play_durability != null ? t('inventory.durabilityV', { n: b.play_durability }) : t('inventory.noBreakYet')}</span>
                      </div>
                      <div className="text-gray-400 text-xs">{t('biz.ballLine', { s: b.sessions_logged, broken: b.broken, cost: b.ball_cost_per_session != null ? formatVnd(b.ball_cost_per_session) : '—' })}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <section className="card">
            <h2 className="text-white font-semibold mb-1">💳 {t('biz.debts')} · <span className="text-yellow-300">{formatVnd(m.owed)}</span> <span className="text-gray-400 font-normal text-sm">({m.debt_count})</span></h2>
            <Hint text={t('biz.debtsHint')} className="mb-2" />
            {m.debts.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('biz.noDebts')}</p>
            ) : (
              <div className="table-wrap">
                <table className="w-full text-sm grid-table !min-w-[28rem]">
                  <thead>
                    <tr className="text-gray-300 text-left bg-navy-900">
                      <th>{t('common.name')}</th>
                      <th>{t('biz.kev')}</th>
                      <th className="text-right">{t('biz.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.debts.map((d) => (
                      <tr key={d.id}>
                        <td className="text-white !whitespace-normal">{d.full_name}</td>
                        <td className="!whitespace-normal"><Link href={`/events/${d.event_id}`} className="text-sky-300 hover:text-lime-300">{dmy(d.event_date)} · {d.title}</Link></td>
                        <td className="text-right tabular-nums text-yellow-300">{formatVnd(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
