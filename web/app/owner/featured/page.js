'use client';
import { useState } from 'react';
import OwnerShell, { fmtTime } from '@/components/OwnerShell';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { localDate } from '@/lib/dates';

const FILTERS = ['todo', 'active', 'all'];
const TONE = { awaiting_payment: 'bg-amber-300/20 text-amber-200', in_review: 'bg-sky-400/20 text-sky-200', active: 'bg-lime-400/20 text-lime-200', rejected: 'bg-red-500/20 text-red-200', cancelled: 'bg-navy-700 text-gray-400', ended: 'bg-navy-700 text-gray-400' };

// Owner: Top 10 cộng đồng uy tín — money in, trust check, place 1-10, take off.
export default function OwnerFeatured() {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get('/api/owner/featured'), []);
  const [filter, setFilter] = useState('todo');
  const [review, setReview] = useState(null); // row being approved
  const [busy, setBusy] = useState(false);
  const day = (v) => (v ? localDate(`${v}T00:00:00`, 'vi-VN') : '—');

  async function act(row, action, body = {}) {
    setBusy(true);
    try {
      await api.post(`/api/owner/featured/${row.id}/${action}`, body);
      setReview(null);
      await reload();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy(false);
    }
  }
  const rows = (data?.rows || []).filter((r) => (filter === 'todo' ? ['awaiting_payment', 'in_review'].includes(r.status) : filter === 'active' ? r.status === 'active' : true));
  const taken = new Set((data?.rows || []).filter((r) => r.status === 'active').map((r) => r.position));

  return (
    <OwnerShell>
      <h1 className="text-white text-2xl font-bold mb-1">🏆 {t('featured.ownerTitle')}</h1>
      <p className="text-gray-400 text-sm mb-4">{data ? t('featured.ownerSub', { n: data.active, slots: data.slots, price: formatVnd(data.price_month) }) : ''}</p>
      {error && <p className="text-red-400 text-sm">{error.message}</p>}
      <div className="flex gap-2 mb-3">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-sm ${filter === f ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-navy-800 text-gray-300'}`}>{t(`featured.f_${f}`)}</button>
        ))}
      </div>
      {rows.length === 0 && <p className="card text-gray-400 text-sm">{t('featured.none')}</p>}
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white font-semibold">{r.club.name} <span className={`ml-1 text-[11px] rounded-full px-2 py-0.5 ${TONE[r.status]}`}>{t(`featured.st_${r.status}`)}</span></p>
                <p className="text-gray-400 text-xs">{[r.club.district, r.club.province].filter(Boolean).join(', ')} · {r.host_email || '—'}</p>
                <p className="text-gray-300 text-xs mt-1">{t('plan.nMonths', { n: r.months })} · {formatVnd(r.amount)} · <span className="font-mono">{r.ref}</span> · {fmtTime(r.created_at)}</p>
                {r.status === 'active' && <p className="text-lime-300 text-xs mt-1">#{r.position} · ⭐ {r.trust_score} · {day(r.starts_on)} – {day(r.ends_on)}</p>}
                {r.owner_note && <p className="text-gray-400 text-xs mt-1">📝 {r.owner_note}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {r.status === 'awaiting_payment' && <button type="button" className="btn-primary !py-1.5 text-sm" disabled={busy} onClick={() => window.confirm(t('featured.paidAsk', { amount: formatVnd(r.amount), ref: r.ref })) && act(r, 'paid')}>💰 {t('featured.markPaid')}</button>}
                {['in_review', 'active'].includes(r.status) && <button type="button" className="btn-primary !py-1.5 text-sm" disabled={busy} onClick={() => setReview({ row: r, trust_score: r.trust_score ?? 80, position: r.position || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((n) => !taken.has(n)) || 10, note: r.owner_note || '' })}>{r.status === 'active' ? t('featured.edit') : `✓ ${t('featured.approve')}`}</button>}
                {['awaiting_payment', 'in_review'].includes(r.status) && <button type="button" className="btn-secondary !py-1.5 text-sm text-red-300" disabled={busy} onClick={() => { const note = window.prompt(t('featured.rejectAsk')); if (note !== null) act(r, 'reject', { note }); }}>{t('featured.reject')}</button>}
                {r.status === 'active' && <button type="button" className="btn-secondary !py-1.5 text-sm text-red-300" disabled={busy} onClick={() => { const note = window.prompt(t('featured.removeAsk')); if (note !== null) act(r, 'remove', { note }); }}>{t('featured.remove')}</button>}
              </div>
            </div>
            {/* What helps judge trust. */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 text-center">
              {[
                [t('featured.s_members'), r.stats?.members ?? 0],
                [t('featured.s_sessions'), r.stats?.events_90d ?? 0],
                [t('featured.s_cancelled'), r.stats?.cancelled_90d ?? 0],
                [t('featured.s_rating'), r.stats?.rating != null ? `${r.stats.rating}★ (${r.stats.ratings})` : '—'],
                [t('featured.s_age'), r.stats?.age_days != null ? t('featured.days', { n: r.stats.age_days }) : '—'],
              ].map(([label, v]) => (
                <div key={label} className="rounded-lg bg-navy-900 px-2 py-2"><div className="text-gray-400 text-[11px]">{label}</div><div className="text-white font-semibold text-sm">{v}</div></div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Modal open={!!review} title={review ? t('featured.reviewTitle', { name: review.row.club.name }) : ''} onClose={() => setReview(null)}>
        {review && (
          <div className="flex flex-col gap-3">
            <label className="text-sm text-gray-300">{t('featured.trustLabel')}
              <input type="number" min={0} max={100} className="input mt-1" value={review.trust_score} onChange={(e) => setReview({ ...review, trust_score: e.target.value })} />
            </label>
            <label className="text-sm text-gray-300">{t('featured.positionLabel')}
              <select className="input mt-1" value={review.position} onChange={(e) => setReview({ ...review, position: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>#{n}{taken.has(n) && n !== review.row.position ? ` · ${t('featured.taken')}` : ''}</option>)}
              </select>
            </label>
            <label className="text-sm text-gray-300">{t('featured.noteLabel')}
              <textarea className="input mt-1" rows={2} maxLength={500} value={review.note} onChange={(e) => setReview({ ...review, note: e.target.value })} />
            </label>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => act(review.row, 'approve', { trust_score: Number(review.trust_score), position: Number(review.position), note: review.note })}>✓ {t('featured.approveSave')}</button>
          </div>
        )}
      </Modal>
    </OwnerShell>
  );
}
