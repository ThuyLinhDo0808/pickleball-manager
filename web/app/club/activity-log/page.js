'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import Pager from '@/components/Pager';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const GROUPS = ['', 'member', 'membership', 'plan', 'payment', 'money', 'event', 'participant', 'attendance', 'match', 'tournament', 'inventory', 'roster', 'club'];
const ROLE_BADGE = { owner: 'bg-lime-400/15 text-lime-200', co_admin: 'bg-violet-400/20 text-violet-200', finance: 'bg-emerald-400/20 text-emerald-200', operator: 'bg-sky-400/20 text-sky-200' };
const when = (iso) => new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

// Who did what in the club (Pro). Every change made in the app is written here, by
// whom and with which role; entries are never edited.
export default function ActivityLogPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const qs = `page=${page}${actor ? `&actor=${encodeURIComponent(actor)}` : ''}${action ? `&action=${action}` : ''}`;
  const { data, error } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/activity-log?${qs}`) : Promise.resolve(null)), [club?.id, qs]);
  const label = (a) => {
    const k = `clubLog.a_${a.replace('.', '_')}`;
    const v = t(k);
    return v === k ? a : v;
  };
  return (
    <AppShell>
      <PageHeader icon="📜" title={t('nav.activityLog')} subtitle={club?.name} />
      <p className="text-gray-400 text-sm mb-3">{t('clubLog.hint')}</p>
      <div className="flex flex-wrap gap-2 mb-3">
        <select className="input text-sm max-w-xs" value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} aria-label={t('clubLog.who')}>
          <option value="">{t('clubLog.everyone')}</option>
          {(data?.actors || []).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="input text-sm max-w-xs" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label={t('clubLog.what')}>
          {GROUPS.map((g) => <option key={g} value={g}>{g ? t(`clubLog.g_${g}`) : t('clubLog.allActions')}</option>)}
        </select>
      </div>
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {data && data.rows.length === 0 && <p className="card text-gray-500 text-sm">{t('clubLog.empty')}</p>}
      {data && data.rows.length > 0 && (
        <ul className="card !py-1 divide-y divide-navy-700">
          {data.rows.map((r) => (
            <li key={r.id} className="py-2.5 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-white text-sm">
                  <span className="font-semibold">{label(r.action)}</span>
                  {r.target && <span className="text-gray-300"> · {r.target}</span>}
                </div>
                <div className="text-gray-400 text-xs mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span>{r.actor_email || '—'}</span>
                  {r.actor_role && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_BADGE[r.actor_role] || 'bg-navy-700 text-gray-300'}`}>{t(`clubLog.role_${r.actor_role}`)}</span>}
                </div>
              </div>
              <span className="text-gray-500 text-xs whitespace-nowrap">{when(r.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={data?.pages} onPage={setPage} />
    </AppShell>
  );
}
