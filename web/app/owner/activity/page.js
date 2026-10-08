'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import OwnerShell, { fmtDate, TIER_BADGE } from '@/components/OwnerShell';
import Pager from '@/components/Pager';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const chip = (on) => `rounded-full px-3 py-1 text-sm border ${on ? 'border-amber-300 bg-amber-300 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`;

// Every club: owner, plan, member counts. Numbers only — no member names or phones.
function Clubs() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('new');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const id = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [q]);
  const { data, error } = useLoad(() => api.get(`/api/owner/activity/clubs?page=${page}&sort=${sort}&q=${encodeURIComponent(query)}`), [page, sort, query]);
  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input className="input text-sm sm:max-w-sm" type="search" placeholder={t('owner.searchClubs')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('owner.searchClubs')} />
        <div className="flex gap-1.5">
          {['new', 'members'].map((s) => <button key={s} type="button" className={chip(sort === s)} onClick={() => { setSort(s); setPage(1); }}>{t(`owner.sort_${s}`)}</button>)}
        </div>
      </div>
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {data && <p className="text-gray-500 text-xs mb-2">{t('owner.nResults', { n: data.total })}</p>}
      {data && data.rows.length === 0 && <p className="card text-gray-500 text-sm">{t('owner.noResults')}</p>}
      {data && data.rows.length > 0 && (
        <ul className="card !py-1 divide-y divide-navy-700">
          {data.rows.map((c) => (
            <li key={c.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-white font-semibold truncate">{c.sport === 'badminton' ? '🏸' : '🏓'} {c.name}</div>
                <Link href={`/owner/hosts/${c.host_id}`} className="text-gray-400 text-xs hover:text-white">{c.owner_email || '—'}</Link>
                <span className="text-gray-500 text-xs"> · {t('owner.createdOn', { d: fmtDate(c.created_at) })}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-300 tabular-nums">👥 {t('owner.fixedGuest', { f: c.members.fixed, g: c.members.guest })}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${TIER_BADGE[c.tier] || TIER_BADGE.free}`}>{c.tier}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={data?.pages} onPage={setPage} />
    </>
  );
}

// Xé Vé games across the app, with how full each one is.
function Xeve() {
  const { t } = useI18n();
  const [when, setWhen] = useState('upcoming');
  const [page, setPage] = useState(1);
  const { data, error } = useLoad(() => api.get(`/api/owner/activity/xeve?when=${when}&page=${page}`), [when, page]);
  return (
    <>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {['upcoming', 'past', 'all'].map((w) => <button key={w} type="button" className={chip(when === w)} onClick={() => { setWhen(w); setPage(1); }}>{t(`owner.when_${w}`)}</button>)}
      </div>
      {data && <p className="text-gray-500 text-xs mb-2">{t('owner.xeveTodayLine', { g: data.today.games, p: data.today.players })} · {t('owner.nResults', { n: data.total })}</p>}
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {data && data.rows.length === 0 && <p className="card text-gray-500 text-sm">{t('owner.noResults')}</p>}
      {data && data.rows.length > 0 && (
        <ul className="card !py-1 divide-y divide-navy-700">
          {data.rows.map((e) => (
            <li key={e.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-white font-semibold truncate">{e.title}</div>
                <div className="text-gray-400 text-xs">
                  {fmtDate(e.event_date)}{e.start_time ? ` ${String(e.start_time).slice(0, 5)}` : ''} · <Link href={`/owner/hosts/${e.host_id}`} className="hover:text-white">{e.host_email || '—'}</Link>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-400">{t(`owner.evst_${e.status}`)}</span>
                <div className="w-28">
                  <div className="text-gray-200 tabular-nums">{e.main_count}/{e.slots ?? '∞'}{e.fill != null ? ` · ${e.fill}%` : ''}</div>
                  {e.fill != null && (
                    <div className="h-1 rounded bg-navy-700 mt-0.5"><div className={`h-1 rounded ${e.fill >= 90 ? 'bg-lime-400' : e.fill >= 50 ? 'bg-amber-300' : 'bg-red-400'}`} style={{ width: `${Math.min(100, e.fill)}%` }} /></div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={data?.pages} onPage={setPage} />
    </>
  );
}

export default function OwnerActivityPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState('clubs');
  return (
    <OwnerShell title={t('owner.tabActivity')}>
      <p className="text-gray-400 text-sm mb-3">{t('owner.activityHint')}</p>
      <div className="flex gap-1.5 mb-4" role="tablist">
        {['clubs', 'xeve'].map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={chip(tab === k)} onClick={() => setTab(k)}>{t(`owner.act_tab_${k}`)}</button>)}
      </div>
      {tab === 'clubs' ? <Clubs /> : <Xeve />}
    </OwnerShell>
  );
}
