'use client';
import { useState } from 'react';
import Link from 'next/link';
import OwnerShell, { fmtTime } from '@/components/OwnerShell';
import Pager from '@/components/Pager';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const STATUSES = ['new', 'in_progress', 'closed'];
const BADGE = { new: 'bg-sky-400/20 text-sky-200', in_progress: 'bg-amber-300/20 text-amber-200', closed: 'bg-navy-700 text-gray-400' };

// Feedback sent from the app ("Góp ý"): new → being handled → closed.
export default function OwnerFeedbackPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState('new');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const { data, error, reload } = useLoad(() => api.get(`/api/owner/feedback?page=${page}${status ? `&status=${status}` : ''}`), [status, page]);
  const move = async (f, next) => {
    setBusy(f.id);
    setErr('');
    try {
      await api.patch(`/api/owner/feedback/${f.id}`, { status: next });
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <OwnerShell title={t('owner.tabFeedback')}>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {[...STATUSES, ''].map((s) => (
          <button key={s || 'all'} type="button" onClick={() => { setStatus(s); setPage(1); }} className={`rounded-full px-3 py-1 text-sm border ${status === s ? 'border-amber-300 bg-amber-300 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}>
            {s ? t(`owner.fb_${s}`) : t('owner.fb_all')}
            {s && data?.counts ? <span className="ml-1 tabular-nums opacity-80">({data.counts[s]})</span> : null}
          </button>
        ))}
      </div>
      {(error || err) && <p className="card text-red-300 text-sm mb-3">{error?.message || err}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {data && data.rows.length === 0 && <p className="card text-gray-500 text-sm">{t('owner.noFeedback')}</p>}
      {data && data.rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.rows.map((f) => (
            <li key={f.id} className="card !p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <span className="text-xs text-gray-400">
                  {fmtTime(f.created_at)} · {f.host_id ? <Link href={`/owner/hosts/${f.host_id}`} className="hover:text-white">{f.host_email || '—'}</Link> : t('owner.anonymous')}
                  {f.contact && f.contact !== f.host_email ? ` · ${f.contact}` : ''}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[f.status] || BADGE.new}`}>{t(`owner.fb_${f.status || 'new'}`)}</span>
              </div>
              <p className="text-gray-100 text-sm whitespace-pre-line break-words">{f.message}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {STATUSES.filter((s) => s !== (f.status || 'new')).map((s) => (
                  <button key={s} type="button" className="btn-secondary !py-1 text-xs" disabled={busy === f.id} onClick={() => move(f, s)}>→ {t(`owner.fb_${s}`)}</button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={data?.pages} onPage={setPage} />
    </OwnerShell>
  );
}
