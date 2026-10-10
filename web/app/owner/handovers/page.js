'use client';
import { useState } from 'react';
import Link from 'next/link';
import OwnerShell, { fmtTime } from '@/components/OwnerShell';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const STATUSES = ['pending', 'approved', 'rejected', 'all'];
const BADGE = { pending: 'bg-amber-300/20 text-amber-200', approved: 'bg-lime-400/20 text-lime-200', rejected: 'bg-red-500/20 text-red-200', cancelled: 'bg-navy-700 text-gray-400' };

// One side of a handover: who it is, so the owner can check the new owner is a real person.
function Person({ p, label }) {
  const { t } = useI18n();
  if (!p) return <div className="text-gray-500 text-sm">{label}: {t('handover.gone')}</div>;
  return (
    <div className="min-w-0 rounded-lg border border-navy-700 bg-navy-900/50 px-3 py-2 text-sm">
      <p className="text-gray-400 text-xs">{label}</p>
      <Link href={`/owner/hosts/${p.id}`} className="text-white font-semibold hover:text-lime-300">{p.full_name || p.email}</Link>
      <p className="text-gray-300 text-xs break-all">{p.email}{p.username ? ` · @${p.username}` : ''}</p>
      <p className="text-gray-400 text-xs">
        📞 {p.phone || '—'} · 🎂 {p.birth_date || '—'} · {t('handover.since', { date: p.joined_at ? p.joined_at.slice(0, 10) : '—' })}
      </p>
      <p className="text-gray-400 text-xs">{t('handover.plan', { tier: (p.tier || 'free').toUpperCase(), n: p.clubs_owned })}</p>
    </div>
  );
}

// Account handovers: a Host who wants to delete their account names who takes over their
// clubs and Xé Vé events. Check the new owner (call them), then approve or reject.
export default function OwnerHandoversPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState('pending');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const { data, error, reload } = useLoad(() => api.get(`/api/owner/handovers?status=${status}`), [status]);

  async function decide(h, decision) {
    const note = decision === 'approve' ? window.prompt(t('handover.approveAsk', { from: h.from_email, to: h.to_email }), '') : window.prompt(t('handover.rejectAsk'));
    if (note === null) return;
    if (decision === 'reject' && !note.trim()) return window.alert(t('handover.reasonRequired'));
    setBusy(h.id);
    setErr('');
    try {
      await api.post(`/api/owner/handovers/${h.id}/${decision}`, { note });
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  const rows = data?.items || [];
  return (
    <OwnerShell title={t('owner.tabHandovers')}>
      <p className="text-gray-400 text-sm mb-3">{t('handover.ownerIntro')}</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={`rounded-full px-3 py-1 text-sm border ${status === s ? 'border-amber-300 bg-amber-300 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}>
            {t(`handover.f_${s}`)}
          </button>
        ))}
      </div>
      {(error || err) && <p className="card text-red-300 text-sm mb-3">{error?.message || err}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {data && rows.length === 0 && <p className="card text-gray-500 text-sm">{t('handover.empty')}</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((h) => (
          <li key={h.id} className="card !p-3">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <p className="text-white font-semibold">
                🔁 {t('handover.what', { n: (h.clubs || []).length, x: h.xeve_events })}
                <span className="block text-gray-400 text-xs font-normal">{fmtTime(h.created_at)} · {(h.clubs || []).map((c) => c.name).join(', ') || '—'}</span>
              </p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[h.status]}`}>{t(`handover.s_${h.status}`)}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Person p={h.from} label={t('handover.from')} />
              <Person p={h.to} label={t('handover.to')} />
            </div>
            {h.note && <p className="text-gray-300 text-sm mt-2">💬 {h.note}</p>}
            {h.owner_note && <p className="text-gray-400 text-xs mt-1">🛡 {h.owner_note}{h.decided_by ? ` — ${h.decided_by}` : ''}</p>}
            {h.status === 'pending' && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn-primary !py-1 text-xs" disabled={busy === h.id} onClick={() => decide(h, 'approve')}>✓ {t('handover.approve')}</button>
                <button type="button" className="btn-secondary !py-1 text-xs text-red-300" disabled={busy === h.id} onClick={() => decide(h, 'reject')}>✕ {t('handover.reject')}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </OwnerShell>
  );
}
