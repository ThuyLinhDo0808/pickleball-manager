'use client';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

// Validated single-series colour on the dark card surface (see FormChart).
const BAR = '#72A313';
const GRID = '#1e2f4d';
const INK_MUTED = '#9ca3af';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Metric({ label, value, tone = 'text-white' }) {
  return (
    <div>
      <div className="text-gray-400 text-xs">{label}</div>
      <div className={`font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function MoveForm({ club, item, kind, onDone, onCancel }) {
  const { t } = useI18n();
  const [f, setF] = useState({ quantity: '', unit_cost: '', sessions_lasted: '', occurred_on: today(), note: '', record_expense: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/clubs/${club.id}/inventory/${item.id}/moves`, {
        kind,
        quantity: Number(f.quantity),
        unit_cost: kind === 'purchase' ? Number(f.unit_cost) : undefined,
        sessions_lasted: kind === 'retire' && f.sessions_lasted !== '' ? Number(f.sessions_lasted) : undefined,
        occurred_on: f.occurred_on,
        note: f.note,
        record_expense: f.record_expense,
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs text-gray-400">{t('inventory.quantity')} ({item.unit})</label>
        <input className="input" type="number" inputMode="numeric" required autoFocus min={kind === 'adjust' ? undefined : 1} value={f.quantity} onChange={set('quantity')} />
      </div>
      <div>
        <label className="text-xs text-gray-400">{t('inventory.date')}</label>
        <input className="input" type="date" value={f.occurred_on} onChange={set('occurred_on')} />
      </div>
      {kind === 'purchase' && (
        <>
          <div className="col-span-2">
            <label className="text-xs text-gray-400">{t('inventory.unitCost')}</label>
            <input className="input" type="number" inputMode="numeric" required min="0" step="1000" value={f.unit_cost} onChange={set('unit_cost')} />
          </div>
          {f.quantity && f.unit_cost && (
            <p className="col-span-2 text-gray-300 text-sm">= {formatVnd(Number(f.quantity) * Number(f.unit_cost))}</p>
          )}
          <label className="col-span-2 flex items-center gap-2 text-sm text-gray-200">
            <input type="checkbox" checked={f.record_expense} onChange={set('record_expense')} />
            {t('inventory.recordExpense')}
          </label>
        </>
      )}
      {kind === 'retire' && (
        <div className="col-span-2">
          <label className="text-xs text-gray-400">{t('inventory.sessionsLasted')}</label>
          <input className="input" type="number" inputMode="decimal" min="0.5" step="0.5" value={f.sessions_lasted} onChange={set('sessions_lasted')} />
          <p className="text-gray-500 text-xs mt-1">{t('inventory.sessionsHint')}</p>
        </div>
      )}
      {kind === 'adjust' && <p className="col-span-2 text-gray-500 text-xs -mt-1">{t('inventory.adjustHint')}</p>}
      <div className="col-span-2">
        <label className="text-xs text-gray-400">{t('inventory.note')}</label>
        <input className="input" value={f.note} onChange={set('note')} />
      </div>
      {error && <p className="col-span-2 text-red-400 text-sm">{error}</p>}
      <div className="col-span-2 flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>{t('common.cancel')}</button>
        <button className="btn-primary flex-1" disabled={busy}>{t('common.save')}</button>
      </div>
    </form>
  );
}

export default function InventoryPage() {
  const { t, lang } = useI18n();
  const { club } = useDefaultClub();
  const { data: items, loading, reload } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/inventory`) : Promise.resolve([])),
    [club?.id]
  );
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', holes: '', unit: 'quả' });
  const [move, setMove] = useState(null); // { item, kind }
  const [openHistory, setOpenHistory] = useState(null);

  async function addItem(e) {
    e.preventDefault();
    await api.post(`/api/clubs/${club.id}/inventory`, newItem);
    setAdding(false);
    setNewItem({ name: '', holes: '', unit: 'quả' });
    reload();
  }

  async function removeMove(item, m) {
    if (!window.confirm(t('inventory.deleteConfirm'))) return;
    await api.del(`/api/clubs/${club.id}/inventory/${item.id}/moves/${m.id}`);
    reload();
  }

  const compare = (items || []).filter((i) => i.cost_per_session != null).map((i) => ({ name: i.name, value: i.cost_per_session, durability: i.durability }));

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-white text-2xl font-bold">{t('inventory.title')}</h1>
        <button className="btn-primary text-sm" onClick={() => setAdding(true)} disabled={!club}>+ {t('inventory.addItem')}</button>
      </div>
      <p className="text-gray-400 text-sm mb-4">{t('inventory.hint')}</p>

      <section className="card mb-4">
        <h2 className="text-white font-semibold">{t('inventory.compare')}</h2>
        <p className="text-gray-500 text-xs mb-2">{t('inventory.compareHint')}</p>
        {compare.length === 0 ? (
          <p className="text-gray-400 text-sm">{t('inventory.needData')}</p>
        ) : (
          <div style={{ height: 48 + compare.length * 40 }} role="img" aria-label={t('inventory.compare')}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compare} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid horizontal={false} stroke={GRID} strokeWidth={1} />
                <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fill: '#e5e7eb', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="bg-navy-950 border border-navy-600 rounded-lg px-3 py-2 text-xs">
                        <div className="text-white font-semibold">{payload[0].payload.name}</div>
                        <div className="text-gray-300">{formatVnd(payload[0].value)} / {t('inventory.costPerSession').toLowerCase()}</div>
                        <div className="text-gray-400">{t('inventory.durabilityVal', { n: payload[0].payload.durability })}</div>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="value" fill={BAR} radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {!loading && (items || []).length === 0 && <p className="text-gray-400 text-sm">{t('inventory.none')}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(items || []).map((i) => (
          <div key={i.id} className="card">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="text-white font-semibold">
                🎾 {i.name}
                {i.holes && <span className="ml-2 text-xs rounded-full px-2 py-0.5 bg-navy-700 text-gray-300">{i.holes} {t('inventory.holes').toLowerCase()}</span>}
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold tabular-nums ${i.stock > 0 ? 'text-lime-400' : 'text-red-400'}`}>{i.stock}</div>
                <div className="text-gray-400 text-xs">{t('inventory.stock')} ({i.unit})</div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <Metric label={t('inventory.avgCost')} value={i.avg_unit_cost != null ? formatVnd(i.avg_unit_cost) : '—'} />
              <Metric label={t('inventory.durability')} value={i.durability != null ? t('inventory.durabilityVal', { n: i.durability }) : '—'} />
              <Metric label={t('inventory.costPerSession')} value={i.cost_per_session != null ? formatVnd(i.cost_per_session) : '—'} tone="text-lime-400" />
              <Metric label={t('inventory.spent')} value={formatVnd(i.total_spent)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary text-sm" onClick={() => setMove({ item: i, kind: 'purchase' })}>+ {t('inventory.purchase')}</button>
              <button className="btn-secondary text-sm" onClick={() => setMove({ item: i, kind: 'retire' })}>{t('inventory.retire')}</button>
              <button className="btn-secondary text-sm" onClick={() => setMove({ item: i, kind: 'adjust' })}>{t('inventory.adjust')}</button>
              <button className="text-gray-400 text-sm underline ml-auto" onClick={() => setOpenHistory(openHistory === i.id ? null : i.id)}>{t('inventory.history')}</button>
            </div>
            {openHistory === i.id && (
              <div className="mt-3 flex flex-col divide-y divide-navy-700 text-sm">
                {i.moves.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-gray-300">
                      {new Date(`${m.occurred_on}T00:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB')} · {t(`inventory.kind_${m.kind}`)}{' '}
                      <span className={m.kind === 'purchase' ? 'text-lime-400' : m.quantity < 0 || m.kind === 'retire' ? 'text-orange-300' : 'text-gray-200'}>
                        {m.kind === 'retire' ? '−' : m.quantity > 0 ? '+' : ''}{m.kind === 'retire' ? m.quantity : m.quantity}
                      </span>
                      {m.unit_cost != null && <span className="text-gray-500"> @ {formatVnd(m.unit_cost)}</span>}
                      {m.sessions_lasted != null && <span className="text-gray-500"> · {t('inventory.durabilityVal', { n: m.sessions_lasted })}</span>}
                      {m.note && <span className="text-gray-500"> · {m.note}</span>}
                    </span>
                    <button className="text-red-400/80 text-xs shrink-0" onClick={() => removeMove(i, m)}>{t('common.delete')}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={adding} title={t('inventory.addItem')} onClose={() => setAdding(false)}>
        <form onSubmit={addItem} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-400">{t('inventory.name')}</label>
            <input className="input" required autoFocus placeholder={t('inventory.namePh')} value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-400">{t('inventory.holes')}</label>
            <input className="input" type="number" inputMode="numeric" min="10" max="80" placeholder="40" value={newItem.holes} onChange={(e) => setNewItem({ ...newItem, holes: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-400">{t('inventory.unit')}</label>
            <input className="input" value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} />
          </div>
          <div className="col-span-2 flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
            <button className="btn-primary flex-1">{t('common.save')}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!move} title={move ? `${t(`inventory.${move.kind}`)} · ${move.item.name}` : ''} onClose={() => setMove(null)}>
        {move && (
          <MoveForm
            club={club}
            item={move.item}
            kind={move.kind}
            onCancel={() => setMove(null)}
            onDone={() => {
              setMove(null);
              reload();
            }}
          />
        )}
      </Modal>
    </AppShell>
  );
}
