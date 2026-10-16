'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/Modal';
import { api } from '@/lib/api';
import { formatDay } from '@/lib/dates';
import { formatVnd } from '@/lib/format';

// "Rời CLB / cộng đồng" on the player's club page: asks once (optional reason), says what
// stays behind (debts, history), and lists upcoming sign-ups that must be cancelled first.
export default function LeaveClub({ club, debt = 0, t, lang }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [upcoming, setUpcoming] = useState([]);
  const kind = t(club.kind === 'community' ? 'leave.kindCommunity' : 'leave.kindClub');

  function close() {
    setOpen(false);
    setError('');
    setUpcoming([]);
  }

  async function leave() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/player/clubs/${club.id}/leave`, { reason });
      router.push('/home');
    } catch (err) {
      const code = err.payload?.code;
      if (code === 'has_upcoming') setUpcoming(err.payload.events || []);
      setError(code === 'has_upcoming' ? t('leave.err_upcoming') : code === 'in_review' ? t('leave.err_review', { kind }) : code === 'own_club' ? t('leave.err_owner', { kind }) : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-8 border-t border-navy-700 pt-4 text-center">
        <button type="button" className="rounded-lg border border-red-500/50 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10" onClick={() => setOpen(true)}>
          🚪 {t('leave.button', { kind })}
        </button>
      </div>
      <Modal open={open} title={t('leave.title', { name: club.name })} onClose={busy ? () => {} : close}>
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-gray-300">{t('leave.body', { kind })}</p>
          {debt > 0 && <p className="rounded-lg border border-yellow-400/40 bg-yellow-400/5 p-2 text-yellow-200">💸 {t('leave.debt', { amount: formatVnd(debt) })}</p>}
          <label className="text-xs text-gray-400">
            {t('leave.reason')}
            <textarea className="input mt-1" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('leave.reasonHint')} />
          </label>
          {error && <p className="text-red-400">{error}</p>}
          {upcoming.length > 0 && (
            <ul className="list-disc pl-5 text-gray-300">
              {upcoming.map((e) => (
                <li key={e.event_id}>{e.title} · {formatDay(e.event_date, lang, { day: 'numeric', month: 'numeric' })}</li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" className="btn-secondary" disabled={busy} onClick={close}>{t('common.cancel')}</button>
            <button type="button" className="rounded-lg bg-red-500 px-3 py-2 font-semibold text-white hover:bg-red-600 disabled:opacity-50" disabled={busy} onClick={leave}>
              {busy ? '…' : t('leave.confirm', { kind })}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
