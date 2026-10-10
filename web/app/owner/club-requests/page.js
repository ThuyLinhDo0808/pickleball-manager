'use client';
import { useState } from 'react';
import Link from 'next/link';
import OwnerShell, { fmtTime } from '@/components/OwnerShell';
import Pager from '@/components/Pager';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

const STATUSES = ['pending', 'approved', 'rejected', 'all'];
const BADGE = { pending: 'bg-amber-300/20 text-amber-200', approved: 'bg-lime-400/20 text-lime-200', rejected: 'bg-red-500/20 text-red-200', cancelled: 'bg-navy-700 text-gray-400' };

// What the requester's account allows: trial still free, plan, clubs owned / limit.
function AccountLine({ a }) {
  const { t } = useI18n();
  if (!a) return null;
  return (
    <p className="text-xs text-gray-400">
      {a.tier === 'free' ? t('ownerReq.noPlan') : `${t('ownerReq.plan')}: ${a.tier.toUpperCase()}${a.trial ? ` (${t('ownerReq.trial')})` : ''}`}
      {' · '}
      {t('ownerReq.clubs', { n: a.clubs_owned, limit: a.club_limit ?? '∞' })}
      {a.trial_available && <span className="text-lime-300"> · 🎁 {t('ownerReq.trialAvailable')}</span>}
      {a.pending_payment && <span className="text-amber-200"> · 💳 {t('ownerReq.paymentWaiting', { amount: formatVnd(a.pending_payment.amount) })}</span>}
    </p>
  );
}

// New clubs wait here: check who asks and what for, then approve (the club is created
// under their account) or reject with a reason they will see.
export default function OwnerClubRequestsPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null); // full request (with pictures)
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const { data, error, reload } = useLoad(() => api.get(`/api/owner/club-requests?status=${status}&page=${page}`), [status, page]);

  async function show(r) {
    setErr('');
    try {
      setOpen(await api.get(`/api/owner/club-requests/${r.id}`));
    } catch (e) {
      setErr(e.message);
    }
  }

  async function decide(r, decision) {
    const note = decision === 'reject' ? window.prompt(t('ownerReq.rejectReason')) : window.prompt(t('ownerReq.approveNote'), '');
    if (note === null) return; // cancelled
    if (decision === 'reject' && !note.trim()) return window.alert(t('ownerReq.reasonRequired'));
    setBusy(r.id);
    setErr('');
    try {
      await api.post(`/api/owner/club-requests/${r.id}/${decision}`, { note });
      setOpen(null);
      await reload();
    } catch (e) {
      setErr(e.payload?.code === 'club_limit' ? t('ownerReq.errClubLimit') : e.message);
    } finally {
      setBusy(null);
    }
  }

  const rows = data?.items || [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <OwnerShell title={t('owner.tabClubRequests')}>
      <p className="text-gray-400 text-sm mb-3">{t('ownerReq.intro')}</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => { setStatus(s); setPage(1); }} className={`rounded-full px-3 py-1 text-sm border ${status === s ? 'border-amber-300 bg-amber-300 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}>
            {t(`ownerReq.f_${s}`)}
            {s === 'pending' && data ? <span className="ml-1 tabular-nums opacity-80">({data.pending})</span> : null}
          </button>
        ))}
      </div>
      {(error || err) && <p className="card text-red-300 text-sm mb-3">{error?.message || err}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {data && rows.length === 0 && <p className="card text-gray-500 text-sm">{t('ownerReq.empty')}</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id} className="card !p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white font-semibold">{r.sport === 'badminton' ? '🏸' : '🏓'} {r.name}</p>
                <p className="text-xs text-gray-400">
                  {fmtTime(r.created_at)} · <Link href={`/owner/hosts/${r.user_id}`} className="hover:text-white">{r.username ? `@${r.username}` : r.email}</Link>
                  {r.username && r.email ? ` · ${r.email}` : ''}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[r.status]}`}>{t(`creq.status_${r.status}`)}</span>
            </div>
            <div className="mt-2 grid gap-x-4 gap-y-0.5 text-sm text-gray-200 sm:grid-cols-2">
              <span>📍 {[r.address, r.district, r.province, r.country].filter(Boolean).join(', ')}</span>
              <span>👥 {t('ownerReq.members', { n: r.member_count })}</span>
              <span>🗓 {r.schedule || '—'}</span>
              <span>✉️ {r.contact_email}</span>
              <span>💎 {t('ownerReq.wants', { tier: String(r.plan_tier).toUpperCase(), n: r.plan_months })}</span>
            </div>
            {r.description && <p className="text-gray-300 text-sm mt-1 whitespace-pre-line break-words">{r.description}</p>}
            <div className="mt-1"><AccountLine a={r.account} /></div>
            {r.owner_note && <p className="text-gray-400 text-xs mt-1">💬 {r.owner_note} {r.decided_by ? `— ${r.decided_by}` : ''}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => show(r)}>🔍 {t('ownerReq.view')}</button>
              {r.status === 'pending' && (
                <>
                  <button type="button" className="btn-primary !py-1 text-xs" disabled={busy === r.id} onClick={() => decide(r, 'approve')}>✓ {t('ownerReq.approve')}</button>
                  <button type="button" className="btn-secondary !py-1 text-xs text-red-300" disabled={busy === r.id} onClick={() => decide(r, 'reject')}>✕ {t('ownerReq.reject')}</button>
                </>
              )}
              {r.club_id && <Link href={`/discover/${r.club_id}`} className="btn-secondary !py-1 text-xs">🏟 {t('ownerReq.openClub')}</Link>}
            </div>
          </li>
        ))}
      </ul>
      <Pager page={page} pages={pages} onPage={setPage} />

      <Modal open={!!open} title={open?.name || ''} onClose={() => setOpen(null)}>
        {open && (
          <div className="flex flex-col gap-3">
            <div className="relative overflow-hidden rounded-xl border border-navy-600 bg-navy-900 aspect-[3/1]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {open.cover ? <img src={open.cover} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-gray-500 text-xs">{t('ownerReq.noCover')}</div>}
              {open.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={open.avatar} alt="" className="absolute bottom-2 left-2 h-14 w-14 rounded-xl border-2 border-navy-950 object-cover" />
              )}
            </div>
            <AccountLine a={open.account} />
            <p className="text-sm text-gray-200 whitespace-pre-line">{open.description || '—'}</p>
            {open.status === 'pending' && (
              <div className="flex gap-2">
                <button type="button" className="btn-primary flex-1" disabled={busy === open.id} onClick={() => decide(open, 'approve')}>✓ {t('ownerReq.approve')}</button>
                <button type="button" className="btn-secondary flex-1 text-red-300" disabled={busy === open.id} onClick={() => decide(open, 'reject')}>✕ {t('ownerReq.reject')}</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </OwnerShell>
  );
}
