'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

// Entry fees: who has paid, collected vs expected. Each tick books a club-fund income.
export default function TournamentFees({ tour }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const { data, setData } = useLoad(() => api.get(`/api/tournaments/${tour.id}/fees`), [tour.id, tour.entry_fee]);

  if (!Number(tour.entry_fee) || !data) return null;

  async function toggle(p) {
    setBusy(p.club_member_id);
    setError('');
    try {
      setData(await api.post(`/api/tournaments/${tour.id}/fees/${p.club_member_id}`, { paid: !p.paid }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const unpaid = data.players.length - data.paid_count;
  return (
    <section className="card mb-4">
      <button type="button" className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="text-white font-semibold">💰 {t('tfee.title')}</span>
        <span className="text-gray-300 text-sm">{t('tfee.perPlayer', { fee: formatVnd(data.entry_fee) })}</span>
        <span className="text-sm">
          <span className="text-lime-400 font-semibold">{formatVnd(data.collected)}</span>
          <span className="text-gray-400"> / {formatVnd(data.expected)}</span>
        </span>
        <span className={`text-sm ${unpaid ? 'text-yellow-300' : 'text-lime-400'}`}>
          {unpaid ? t('tfee.unpaid', { n: unpaid, total: data.players.length }) : t('tfee.allPaid')}
        </span>
        <span className="ml-auto text-gray-400 text-sm">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-3">
          <p className="text-gray-500 text-xs mb-2">{t('tfee.hint')}</p>
          {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {data.players.map((p) => (
              <button
                key={p.club_member_id}
                type="button"
                disabled={busy === p.club_member_id}
                onClick={() => toggle(p)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-left ${p.paid ? 'border-lime-400/60 bg-lime-400/10' : 'border-navy-600 hover:border-navy-500'}`}
              >
                <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${p.paid ? 'bg-lime-400 border-lime-400 text-navy-950' : 'border-gray-500'}`}>{p.paid ? '✓' : ''}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-white block truncate">{p.full_name}</span>
                  <span className="text-gray-500 text-xs block truncate">{p.team}</span>
                </span>
                <span className={`text-xs shrink-0 ${p.paid ? 'text-lime-300' : 'text-gray-400'}`}>{p.paid ? t('tfee.paid') : t('tfee.notPaid')}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
