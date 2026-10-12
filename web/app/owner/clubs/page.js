'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import OwnerShell, { fmtDate, TIER_BADGE, useOwnerMe } from '@/components/OwnerShell';
import DeleteClub from '@/components/OwnerDeleteClub';
import Pager from '@/components/Pager';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const chip = (on) => `rounded-full px-3 py-1 text-sm border ${on ? 'border-amber-300 bg-amber-300 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`;

// One row: name, kind, owner, plan, members, sessions; owners can delete it here.
function Row({ c, onDeleted }) {
  const { t } = useI18n();
  const me = useOwnerMe();
  const [del, setDel] = useState(false);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-white font-semibold truncate">
            {c.sport === 'badminton' ? '🏸' : '🏓'} {c.name}
            <span className={`ml-2 align-middle text-[10px] rounded-full border px-1.5 py-0.5 ${c.kind === 'community' ? 'border-amber-300/60 text-amber-200' : 'border-lime-400/50 text-lime-200'}`}>
              {c.kind === 'community' ? `🎟 ${t('creq.kind_community')}` : `🏟 ${t('creq.kind_club')}`}
            </span>
          </div>
          <Link href={`/owner/hosts/${c.host_id}`} className="text-gray-400 text-xs hover:text-white">{c.owner_email || '—'}</Link>
          <span className="text-gray-500 text-xs"> · {t('owner.createdOn', { d: fmtDate(c.created_at) })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-gray-300 tabular-nums">👥 {t('owner.fixedGuest', { f: c.members.fixed, g: c.members.guest })}</span>
          <span className="text-gray-300 tabular-nums">🗓 {t('owner.clubsEvents', { n: c.events })}{c.last_event ? ` · ${t('owner.clubsLast', { d: fmtDate(c.last_event) })}` : ''}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${TIER_BADGE[c.tier] || TIER_BADGE.free}`}>{c.tier}</span>
          {me?.owner && (
            <button type="button" className="text-red-300 hover:underline" onClick={() => setDel(!del)}>🗑 {t('owner.delClubBtn')}</button>
          )}
        </div>
      </div>
      {del && <DeleteClub club={c} onDone={() => { setDel(false); onDeleted(); }} />}
    </li>
  );
}

// Every club and play community in the app.
export default function OwnerClubsPage() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [sort, setSort] = useState('new');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const id = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [q]);
  const { data, error, reload } = useLoad(() => api.get(`/api/owner/clubs?page=${page}&kind=${kind}&sort=${sort}&q=${encodeURIComponent(query)}`), [page, kind, sort, query]);
  const tot = data?.totals;
  return (
    <OwnerShell title={t('owner.tabClubs')}>
      <p className="text-gray-400 text-sm mb-3">{t('owner.clubsHint')}</p>
      <div className="flex flex-wrap gap-1.5 mb-2" role="tablist">
        {['all', 'club', 'community'].map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={chip(kind === k)} onClick={() => { setKind(k); setPage(1); }}>
            {t(`owner.clubsKind_${k}`)}{tot ? ` (${tot[k]})` : ''}
          </button>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input className="input text-sm sm:max-w-sm" type="search" placeholder={t('owner.searchClubs')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('owner.searchClubs')} />
        <div className="flex flex-wrap gap-1.5">
          {['new', 'members', 'events', 'name'].map((s) => <button key={s} type="button" className={chip(sort === s)} onClick={() => { setSort(s); setPage(1); }}>{t(`owner.sort_${s}`)}</button>)}
        </div>
      </div>
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {data && <p className="text-gray-500 text-xs mb-2">{t('owner.nResults', { n: data.total })}</p>}
      {data && data.rows.length === 0 && <p className="card text-gray-500 text-sm">{t('owner.noResults')}</p>}
      {data && data.rows.length > 0 && (
        <ul className="card !py-1 divide-y divide-navy-700">
          {data.rows.map((c) => <Row key={c.id} c={c} onDeleted={reload} />)}
        </ul>
      )}
      <Pager page={page} pages={data?.pages} onPage={setPage} />
    </OwnerShell>
  );
}
