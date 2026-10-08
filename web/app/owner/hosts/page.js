'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import OwnerShell, { fmtDate, fmtTime, TIER_BADGE } from '@/components/OwnerShell';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const FILTERS = ['hosts', 'paying', 'free', 'expiring', 'suspended', 'all'];

function Usage({ used, limit }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="min-w-[72px]">
      <div className="text-gray-200 text-xs tabular-nums">{used}/{limit ?? '∞'}</div>
      {limit != null && (
        <div className="h-1 rounded bg-navy-700 mt-0.5">
          <div className={`h-1 rounded ${pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-300' : 'bg-lime-400'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function HostList() {
  const { t } = useI18n();
  const params = useSearchParams();
  const [filter, setFilter] = useState(FILTERS.includes(params.get('filter')) ? params.get('filter') : 'hosts');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  // Search as you type, after a short pause.
  useEffect(() => {
    const id = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [q]);
  const { data, error, loading } = useLoad(
    () => api.get(`/api/owner/hosts?filter=${filter}&page=${page}&q=${encodeURIComponent(query)}`),
    [filter, page, query],
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input className="input text-sm sm:max-w-sm" type="search" placeholder={t('owner.searchHosts')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('owner.searchHosts')} />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f} type="button" onClick={() => { setFilter(f); setPage(1); }} className={`rounded-full px-3 py-1 text-sm border ${filter === f ? 'border-amber-300 bg-amber-300 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}>
              {t(`owner.f_${f}`)}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}
      {data && <p className="text-gray-500 text-xs mb-2">{t('owner.nResults', { n: data.total })}</p>}

      {/* Phones: cards. Wider screens: a table. */}
      <div className="flex flex-col gap-2 md:hidden">
        {data?.rows.map((r) => (
          <Link key={r.id} href={`/owner/hosts/${r.id}`} className="card !p-3 block">
            <div className="flex items-center justify-between gap-2">
              <span className="text-white font-semibold truncate">{r.full_name || r.email}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${TIER_BADGE[r.tier]}`}>{r.tier}</span>
            </div>
            <div className="text-gray-400 text-xs truncate">{r.email}{r.phone ? ` · ${r.phone}` : ''}</div>
            <div className="flex flex-wrap gap-x-3 text-xs text-gray-400 mt-1">
              <span>🏠 {r.clubs_owned}/{r.club_limit ?? '∞'}</span>
              <span>👥 {r.people_used}/{r.people_limit}</span>
              {r.social_manager && <span className="text-amber-200">🎟 SM</span>}
              {r.suspended_at && <span className="text-red-300">⛔ {t('owner.suspended')}</span>}
            </div>
          </Link>
        ))}
      </div>
      <div className="hidden md:block card !p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-400 text-xs text-left">
            <tr className="border-b border-navy-700">
              <th className="px-3 py-2 font-medium">{t('owner.colHost')}</th>
              <th className="px-3 py-2 font-medium">{t('owner.colPlan')}</th>
              <th className="px-3 py-2 font-medium">{t('owner.colStatus')}</th>
              <th className="px-3 py-2 font-medium">{t('owner.colClubs')}</th>
              <th className="px-3 py-2 font-medium">{t('owner.colPeople')}</th>
              <th className="px-3 py-2 font-medium">{t('owner.colLastSeen')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id} className="border-b border-navy-800 last:border-0 hover:bg-navy-800/50">
                <td className="px-3 py-2 max-w-[280px]">
                  <Link href={`/owner/hosts/${r.id}`} className="text-white font-semibold hover:underline block truncate">{r.full_name || r.email}</Link>
                  <div className="text-gray-400 text-xs truncate">{r.email}{r.phone ? ` · ${r.phone}` : ''}</div>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${TIER_BADGE[r.tier]}`}>{r.tier}</span>
                  {r.social_manager && <span className="ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold bg-amber-300/20 text-amber-200">SM</span>}
                  {r.tier_paid_until && <div className="text-gray-500 text-[11px] mt-0.5">→ {fmtDate(r.tier_paid_until)}</div>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.suspended_at ? <span className="text-red-300">⛔ {t('owner.suspended')}</span> : <span className="text-lime-300">● {t('owner.active')}</span>}
                </td>
                <td className="px-3 py-2"><Usage used={r.clubs_owned} limit={r.club_limit} /></td>
                <td className="px-3 py-2"><Usage used={r.people_used} limit={r.people_limit} /></td>
                <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">{fmtTime(r.last_sign_in_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.rows.length === 0 && <p className="text-gray-500 text-sm p-4">{t('owner.noResults')}</p>}
      </div>
      {data && data.rows.length === 0 && <p className="md:hidden card text-gray-500 text-sm">{t('owner.noResults')}</p>}
      {loading && !data && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button type="button" className="btn-secondary !py-1 text-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
          <span className="text-gray-400 text-sm tabular-nums">{page}/{pages}</span>
          <button type="button" className="btn-secondary !py-1 text-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>→</button>
        </div>
      )}
    </>
  );
}

export default function OwnerHostsPage() {
  const { t } = useI18n();
  return (
    <OwnerShell title={t('owner.tabHosts')}>
      <Suspense fallback={null}>
        <HostList />
      </Suspense>
    </OwnerShell>
  );
}
