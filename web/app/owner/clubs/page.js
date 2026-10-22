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

const KIND_CHIP = {
  community: 'bg-amber-300/15 text-amber-200 ring-amber-300/30',
  club: 'bg-lime-400/10 text-lime-200 ring-lime-400/25',
};

// One row of the table; owners can open the delete box under it.
function Row({ c, onDeleted }) {
  const { t } = useI18n();
  const me = useOwnerMe();
  const [del, setDel] = useState(false);
  return (
    <>
      <tr className="border-b border-navy-700 hover:bg-navy-800/40 align-middle">
        <td className="px-3 py-2.5 max-w-[260px] max-sm:max-w-none">
          <div className="text-white font-semibold break-words">{c.name}</div>
          <div className="text-gray-500 text-xs">{t(`clubs.sport_${c.sport}`)}</div>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${KIND_CHIP[c.kind]}`}>{t(c.kind === 'community' ? 'creq.kind_community' : 'creq.kind_club')}</span>
        </td>
        <td className="px-3 py-2.5 max-w-[220px]">
          <Link href={`/owner/hosts/${c.host_id}`} className="text-gray-200 hover:text-amber-200 break-words block">{c.owner_email || '—'}</Link>
          <span className={`mt-0.5 inline-block rounded px-1.5 text-[10px] font-bold ${TIER_BADGE[c.tier] || TIER_BADGE.free}`}>{c.tier}</span>
        </td>
        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
          <span className="text-white font-semibold">{c.members.fixed + c.members.guest}</span>
          <span className="text-gray-500 text-xs"> · {t('owner.fixedGuest', { f: c.members.fixed, g: c.members.guest })}</span>
        </td>
        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
          <span className="text-white font-semibold">{c.events}</span>
          <span className="text-gray-500 text-xs block">{c.last_event ? t('owner.clubsLast', { d: fmtDate(c.last_event) }) : '—'}</span>
        </td>
        <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(c.created_at)}</td>
        <td className="act px-3 py-2.5 text-right whitespace-nowrap">
          {me?.owner && (
            <button type="button" onClick={() => setDel(!del)} className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${del ? 'bg-red-500/20 text-red-200 ring-red-400/40' : 'text-red-300 ring-red-400/30 hover:bg-red-500/10'}`}>
              {t('owner.delClubBtn')}
            </button>
          )}
        </td>
      </tr>
      {del && (
        <tr className="border-b border-navy-800">
          <td colSpan={7} className="px-3 pb-3"><DeleteClub club={c} onDone={() => { setDel(false); onDeleted(); }} /></td>
        </tr>
      )}
    </>
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
    <OwnerShell title={t('owner.tabClubs')} description={t('owner.clubsHint')}>
      <div className="flex flex-wrap gap-1.5 mb-2" role="tablist">
        {['all', 'club', 'community'].map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={chip(kind === k)} onClick={() => { setKind(k); setPage(1); }}>
            {t(`owner.clubsKind_${k}`)}{tot ? <span className="ml-1 opacity-70 tabular-nums">{tot[k]}</span> : null}
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
        <div className="rounded-xl border border-navy-700 bg-navy-900 overflow-x-auto max-sm:px-3">
          <table className="w-full text-sm min-w-[860px] mobile-list">
            <thead className="text-gray-400 text-sm text-left">
              <tr className="border-b border-navy-700">
                {['colName', 'colKind', 'colOwner', 'colMembers', 'colSessions', 'colCreated'].map((k) => <th key={k} className="px-3 py-2.5 font-normal">{t(`owner.clubs_${k}`)}</th>)}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>{data.rows.map((c) => <Row key={c.id} c={c} onDeleted={reload} />)}</tbody>
          </table>
        </div>
      )}
      <Pager page={page} pages={data?.pages} onPage={setPage} />
    </OwnerShell>
  );
}
