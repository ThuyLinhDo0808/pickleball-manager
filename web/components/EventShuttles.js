'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

// Badminton: shuttles used in this session (taken out of the club's stock), what they
// cost at the average purchase price, and the share per player present.
export default function EventShuttles({ event }) {
  const { t } = useI18n();
  const { data, reload } = useLoad(() => api.get(`/api/events/${event.id}/shuttles`).catch(() => null), [event.id]);
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!data) return null;

  const item = itemId || data.items[0]?.id || '';
  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/clubs/${event.club_id}/inventory/${item}/moves`, { kind: 'use', quantity: Number(qty), event_id: event.id });
      setQty('');
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(u) {
    try {
      await api.del(`/api/clubs/${event.club_id}/inventory/${u.item_id}/moves/${u.move_id}`);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card mb-4">
      <h2 className="text-white font-semibold mb-2">🏸 {t('shuttles.title')}</h2>
      {data.items.length === 0 ? (
        <p className="text-gray-400 text-sm">{t('shuttles.noItems')}</p>
      ) : (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 mb-3">
          <div className="min-w-0 flex-1 basis-48">
            <label htmlFor="sh-item" className="text-xs text-gray-400">{t('shuttles.item')}</label>
            <select id="sh-item" className="input" value={item} onChange={(e) => setItemId(e.target.value)}>
              {data.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {t('shuttles.stockLeft', { n: i.stock })}
                </option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label htmlFor="sh-qty" className="text-xs text-gray-400">{t('shuttles.qty')}</label>
            <input id="sh-qty" className="input" type="number" inputMode="numeric" min="1" required value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <button className="btn-primary" disabled={busy || !item}>{t('shuttles.add')}</button>
        </form>
      )}
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      {data.used.length === 0 ? (
        <p className="text-gray-500 text-sm">{t('shuttles.none')}</p>
      ) : (
        <>
          <ul className="divide-y divide-navy-700 text-sm mb-2">
            {data.used.map((u) => (
              <li key={u.move_id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-gray-200">
                  {u.name} · <span className="tabular-nums">{u.quantity}</span> {u.unit}
                  <span className="text-gray-500"> · {formatVnd(u.cost)}</span>
                </span>
                <button type="button" className="text-red-400/80 text-xs" onClick={() => remove(u)}>{t('shuttles.remove')}</button>
              </li>
            ))}
          </ul>
          <p className="text-white font-semibold text-sm">{t('shuttles.total', { n: data.total_qty, cost: formatVnd(data.total_cost) })}</p>
          <p className="text-lime-400 text-sm">
            {data.players ? t('shuttles.perPlayer', { n: data.players, amount: formatVnd(data.per_player) }) : <span className="text-gray-400">{t('shuttles.noPlayers')}</span>}
          </p>
        </>
      )}
    </section>
  );
}
