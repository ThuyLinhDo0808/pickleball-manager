'use client';
import { useState } from 'react';
import Link from 'next/link';
import OwnerShell, { fmtTime } from '@/components/OwnerShell';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const TONE = { active: 'bg-lime-400/20 text-lime-200', paused: 'bg-amber-300/20 text-amber-200', blocked: 'bg-red-500/20 text-red-200' };

// Owner: Coach — every coach profile (students, open classes, sessions in 30 days, rating,
// open reports), block / unblock with a reason, the reports and reviews of one coach.
export default function OwnerCoaches() {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get('/api/owner/coaches'), []);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const needle = q.trim().toLowerCase();
  const rows = (data?.rows || []).filter(
    (r) => (filter === 'all' || (filter === 'reported' ? r.open_reports > 0 : r.status === filter)) && (!needle || [r.display_name, r.email, r.slug, r.area].filter(Boolean).some((x) => x.toLowerCase().includes(needle))),
  );
  const { data: detail, reload: reloadDetail } = useLoad(() => (open ? api.get(`/api/owner/coaches/${open}`) : Promise.resolve(null)), [open]);

  async function act(fn) {
    setBusy(true);
    try {
      await fn();
      reload();
      reloadDetail();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy(false);
    }
  }
  function block(r) {
    const reason = window.prompt(t('ocoach.blockAsk', { name: r.display_name }));
    if (reason == null || !reason.trim()) return;
    act(() => api.patch(`/api/owner/coaches/${r.id}`, { action: 'block', reason }));
  }
  const unblock = (r) => window.confirm(t('ocoach.unblockAsk', { name: r.display_name })) && act(() => api.patch(`/api/owner/coaches/${r.id}`, { action: 'unblock' }));

  return (
    <OwnerShell>
      <h1 className="text-white text-2xl font-bold mb-1">{t('ocoach.title')}</h1>
      <p className="text-gray-400 text-sm mb-4">{t('ocoach.sub')}</p>
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}
      {data && !data.ready && <p className="card text-amber-200 text-sm">{t('ocoach.notReady')}</p>}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input className="input !w-auto flex-1 min-w-[12rem] text-sm" placeholder={t('ocoach.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('ocoach.search')} />
        {['all', 'active', 'paused', 'blocked', 'reported'].map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 text-sm ${filter === f ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-navy-800 text-gray-300'}`}>{t(`ocoach.f_${f}`)}</button>
        ))}
      </div>
      {data?.ready && rows.length === 0 && <p className="card text-gray-400 text-sm">{t('ocoach.none')}</p>}
      {rows.length > 0 && (
        <div className="card !p-0 overflow-hidden">
          <div className="hidden lg:grid grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))_minmax(0,1.4fr)] gap-3 px-4 py-2 border-b border-navy-700 text-xs text-gray-400">
            <span>{t('ocoach.colCoach')}</span>
            <span className="text-right">{t('ocoach.colStudents')}</span>
            <span className="text-right">{t('ocoach.colClasses')}</span>
            <span className="text-right">{t('ocoach.colSessions')}</span>
            <span className="text-right">{t('ocoach.colRating')}</span>
            <span className="text-right">{t('ocoach.colReports')}</span>
            <span />
          </div>
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))_minmax(0,1.4fr)] gap-x-3 gap-y-1 px-4 py-3 border-b border-navy-700 last:border-b-0 text-sm items-center">
              <button type="button" onClick={() => setOpen(r.id)} className="col-span-2 lg:col-span-1 text-left min-w-0">
                <span className="text-white font-medium break-words">{r.display_name}</span>
                <span className={`ml-2 text-[11px] rounded-full px-2 py-0.5 ${TONE[r.status]}`}>{t(`ocoach.st_${r.status}`)}</span>
                <span className="block text-gray-400 text-xs break-all">{r.email || '—'} · /coach/{r.slug}{r.area ? ` · ${r.area}` : ''}</span>
              </button>
              <span className="text-gray-300 tabular-nums lg:text-right"><span className="lg:hidden text-gray-500">{t('ocoach.colStudents')}: </span>{r.students}</span>
              <span className="text-gray-300 tabular-nums lg:text-right"><span className="lg:hidden text-gray-500">{t('ocoach.colClasses')}: </span>{r.classes}</span>
              <span className="text-gray-300 tabular-nums lg:text-right"><span className="lg:hidden text-gray-500">{t('ocoach.colSessions')}: </span>{r.sessions_30d}</span>
              <span className="text-gray-300 tabular-nums lg:text-right"><span className="lg:hidden text-gray-500">{t('ocoach.colRating')}: </span>{r.rating != null ? `${r.rating} ★ (${r.reviews})` : <span className="text-gray-500">—</span>}</span>
              <span className={`tabular-nums lg:text-right ${r.open_reports ? 'text-red-300 font-semibold' : 'text-gray-500'}`}><span className="lg:hidden text-gray-500 font-normal">{t('ocoach.colReports')}: </span>{r.open_reports || '—'}</span>
              <span className="col-span-2 lg:col-span-1 flex justify-end gap-2">
                <Link href={`/coach/${r.slug}`} className="btn-secondary text-xs" target="_blank">{t('ocoach.view')}</Link>
                {r.status === 'blocked' ? (
                  <button type="button" disabled={busy} className="btn-secondary text-xs" onClick={() => unblock(r)}>{t('ocoach.unblock')}</button>
                ) : (
                  <button type="button" disabled={busy} className="btn-secondary text-xs !text-red-300" onClick={() => block(r)}>{t('ocoach.block')}</button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!open} title={detail?.display_name || t('ocoach.title')} onClose={() => setOpen(null)}>
        {detail && (
          <div className="grid gap-4 text-sm">
            <div className="text-gray-300">
              <p className="break-all">{detail.email || '—'} · <Link href={`/coach/${detail.slug}`} className="text-sky-300 hover:underline" target="_blank">/coach/{detail.slug}</Link></p>
              <p className="text-gray-400 text-xs">{t(`clubs.sport_${detail.sport}`)}{detail.area ? ` · ${detail.area}` : ''} · {t('ocoach.since', { d: fmtTime(detail.created_at) })}</p>
              {detail.status === 'blocked' && <p className="text-red-300 mt-1">{t('ocoach.blockedBecause', { reason: detail.block_reason || '—', d: fmtTime(detail.blocked_at) })}</p>}
            </div>
            <section>
              <h3 className="text-white font-semibold mb-1">{t('ocoach.reports')} <span className="text-gray-500 font-normal">({detail.reports.length})</span></h3>
              {!detail.reports.length && <p className="text-gray-500">{t('ocoach.noReports')}</p>}
              {detail.reports.map((x) => (
                <div key={x.id} className={`flex items-start gap-2 py-2 border-b border-navy-700 last:border-b-0 ${x.status === 'closed' ? 'opacity-60' : ''}`}>
                  <span className="flex-1 min-w-0 text-gray-200 break-words whitespace-pre-line">{x.reason}<span className="block text-gray-500 text-xs">{fmtTime(x.created_at)}</span></span>
                  <button type="button" disabled={busy} className="text-xs text-lime-300 px-2 min-h-[44px]" onClick={() => act(() => api.patch(`/api/owner/coach-reports/${x.id}`, { status: x.status === 'open' ? 'closed' : 'open' }))}>
                    {x.status === 'open' ? t('ocoach.closeReport') : t('ocoach.reopenReport')}
                  </button>
                </div>
              ))}
            </section>
            <section>
              <h3 className="text-white font-semibold mb-1">{t('ocoach.reviews')} <span className="text-gray-500 font-normal">({detail.reviews.length})</span></h3>
              {!detail.reviews.length && <p className="text-gray-500">{t('ocoach.noReviews')}</p>}
              {detail.reviews.map((x) => (
                <div key={x.id} className={`flex items-start gap-2 py-2 border-b border-navy-700 last:border-b-0 ${x.hidden ? 'opacity-60' : ''}`}>
                  <span className="flex-1 min-w-0 text-gray-200 break-words"><span className="text-amber-200">{'★'.repeat(x.stars)}</span> {x.body || ''}<span className="block text-gray-500 text-xs">{fmtTime(x.created_at)}{x.hidden ? ` · ${t('ocoach.hidden')}` : ''}</span></span>
                  <button type="button" disabled={busy} className="text-xs text-gray-300 px-2 min-h-[44px]" onClick={() => act(() => api.patch(`/api/owner/coach-reviews/${x.id}`, { hidden: !x.hidden }))}>
                    {x.hidden ? t('ocoach.showReview') : t('ocoach.hideReview')}
                  </button>
                </div>
              ))}
            </section>
          </div>
        )}
      </Modal>
    </OwnerShell>
  );
}
