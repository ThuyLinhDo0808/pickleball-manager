'use client';
import { useState } from 'react';
import Link from 'next/link';
import OwnerShell, { fmtTime } from '@/components/OwnerShell';
import Pager from '@/components/Pager';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { FEEDBACK_CATEGORIES } from '@/components/FeedbackButton';
import ChipRow from '@/components/ui/ChipRow';

const STATUSES = ['new', 'in_progress', 'closed'];
const TABS = [...STATUSES, 'spam'];
const BADGE = { new: 'bg-sky-400/20 text-sky-200', in_progress: 'bg-amber-300/20 text-amber-200', closed: 'bg-navy-700 text-gray-400', spam: 'bg-red-500/15 text-red-300' };

// Messages from "Báo lỗi / Liên hệ": new → being handled → closed, by kind (bug, hard to
// use, idea, plans & payment, personal data). Spam goes to its own tab, and the sender
// can be blocked from sending more.
export default function OwnerFeedbackPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState('new');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const { data, error, reload } = useLoad(() => api.get(`/api/owner/feedback?page=${page}${status ? `&status=${status}` : ''}${category ? `&category=${category}` : ''}`), [status, category, page]);
  const act = async (f, run) => {
    setBusy(f.id);
    setErr('');
    try {
      await run();
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };
  const move = (f, next) => act(f, () => api.patch(`/api/owner/feedback/${f.id}`, { status: next }));
  const block = (f, blocked) => {
    if (blocked && !window.confirm(t('owner.fb_blockAsk', { email: f.host_email || '—' }))) return;
    act(f, () => api.post(`/api/owner/feedback/${f.id}/block`, { blocked }));
  };
  return (
    <OwnerShell title={t('owner.tabFeedback')} description={t('owner.desc_feedback')}>
      <ChipRow gap="gap-1.5" className="mb-2">
        {[...TABS, ''].map((s) => (
          <button key={s || 'all'} type="button" onClick={() => { setStatus(s); setPage(1); }} className={`rounded-full px-3 py-1 text-sm border ${status === s ? 'border-amber-300 bg-amber-300 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}>
            {s ? t(`owner.fb_${s}`) : t('owner.fb_all')}
            {s && data?.counts ? <span className="ml-1 tabular-nums opacity-80">({data.counts[s]})</span> : null}
          </button>
        ))}
      </ChipRow>
      <ChipRow gap="gap-1.5" className="mb-3" role="radiogroup" aria-label={t('feedback.category')}>
        {['', ...FEEDBACK_CATEGORIES].map((c) => (
          <button key={c || 'all'} type="button" role="radio" aria-checked={category === c} onClick={() => { setCategory(c); setPage(1); }} className={`rounded-full px-2.5 py-0.5 text-xs border ${category === c ? 'border-sky-300 bg-sky-300/20 text-sky-100 font-semibold' : 'border-navy-600 text-gray-400'}`}>
            {c ? t(`feedback.cat_${c}`) : t('owner.fb_allKinds')}
          </button>
        ))}
      </ChipRow>
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
                <span className="flex flex-wrap items-center gap-1.5">
                  {f.category && <span className="rounded-full border border-navy-600 px-2 py-0.5 text-[11px] text-gray-200">{t(`feedback.cat_${f.category}`)}</span>}
                  {f.sender_blocked && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-500/15 text-red-300">{t('owner.fb_blocked')}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[f.status] || BADGE.new}`}>{t(`owner.fb_${f.status || 'new'}`)}</span>
                </span>
              </div>
              <p className="text-gray-100 text-sm whitespace-pre-line break-words">{f.message}</p>
              {(f.page || f.device) && (
                <p className="text-[11px] text-gray-500 mt-1 break-words">
                  {f.page && <>{t('owner.fb_page')}: <span className="text-gray-400">{f.page}</span></>}
                  {f.page && f.device && ' · '}
                  {f.device && <>{t('owner.fb_device')}: <span className="text-gray-400">{f.device}</span></>}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {STATUSES.filter((s) => s !== (f.status || 'new')).map((s) => (
                  <button key={s} type="button" className="btn-secondary !py-1 text-xs" disabled={busy === f.id} onClick={() => move(f, s)}>→ {t(`owner.fb_${s}`)}</button>
                ))}
                {f.status !== 'spam' && (
                  <button type="button" className="rounded-lg border border-red-500/40 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10" disabled={busy === f.id} onClick={() => move(f, 'spam')}>{t('owner.fb_markSpam')}</button>
                )}
                {f.host_id && (
                  <button type="button" className="ml-auto text-xs text-gray-400 hover:text-red-300 underline underline-offset-2" disabled={busy === f.id} onClick={() => block(f, !f.sender_blocked)}>
                    {f.sender_blocked ? t('owner.fb_unblock') : `${t('owner.fb_block')}`}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={data?.pages} onPage={setPage} />
    </OwnerShell>
  );
}
