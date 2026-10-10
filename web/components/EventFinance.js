'use client';
import { useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { categoryLabel, describeEntry, EVENT_EXPENSE, EVENT_INCOME } from '@/lib/finance';

const AUTO = new Set(['membership', 'event_fee', 'tournament_fee', 'meeting']);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Income is "Thu"; money out on a session is "Chi phí phát sinh".
const sideLabel = (ty, t) => (ty === 'expense' ? t('evfin.expense') : t('finance.income'));

// Fix an entry. A new amount or type is saved as a corrected entry (the old one is voided,
// so the ledger keeps its history); category, date and note change in place.
function EditEntry({ entry, onClose, onSaved }) {
  const { t } = useI18n();
  const [f, setF] = useState({ type: entry.type, category: entry.category || 'other', amount: String(Number(entry.amount)), occurred_on: entry.occurred_on, note: entry.note || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cats = f.type === 'income' ? EVENT_INCOME : EVENT_EXPENSE;
  const choices = cats.includes(f.category) ? cats : [...cats, f.category];
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.patch(`/api/transactions/${entry.id}`, { type: f.type, category: f.category, amount: Number(f.amount), occurred_on: f.occurred_on, note: f.note.trim() || null });
      onSaved();
    } catch (err) {
      setError(err.payload?.code?.startsWith('linked_') ? t('fin.autoHint') : err.message);
      setBusy(false);
    }
  }
  return (
    <Modal open title={`✏️ ${t('fin.editTitle')}`} onClose={onClose}>
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div className="col-span-2 grid grid-cols-2 bg-navy-950 rounded-lg p-1 text-sm">
          {['income', 'expense'].map((ty) => (
            <button key={ty} type="button" onClick={() => setF({ ...f, type: ty, category: ty === entry.type ? entry.category || 'other' : ty === 'income' ? 'other' : 'court' })} className={`rounded-md py-1.5 ${f.type === ty ? (ty === 'income' ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-orange-500 text-white font-semibold') : 'text-gray-400'}`}>
              {sideLabel(ty, t)}
            </button>
          ))}
        </div>
        <label className="col-span-2 sm:col-span-1 text-xs text-gray-400">{t('fin.category')}
          <select className="input mt-1" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {choices.map((c) => <option key={c} value={c}>{categoryLabel(c, t)}</option>)}
          </select>
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-gray-400">{t('fin.amount')}
          <input className="input mt-1" type="number" inputMode="numeric" min="0" step="1" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-gray-400">{t('fin.date')}
          <input className="input mt-1" type="date" required value={f.occurred_on} onChange={(e) => setF({ ...f, occurred_on: e.target.value })} />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-gray-400">{t('fin.note')}
          <input className="input mt-1" required={f.category === 'other'} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        <p className="col-span-2 text-gray-500 text-xs">{t('fin.editHint')}</p>
        {error && <p className="col-span-2 text-red-400 text-sm">{error}</p>}
        <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary" disabled={busy}>{t('common.save')}</button>
      </form>
    </Modal>
  );
}

// The money tab of a session / kèo. Every entry here is also in the Host's ledger
// (Tài chính → Sổ thu chi): fees players paid, the session's costs, anything added here.
export default function EventFinance({ event, finance, onChanged }) {
  const { t } = useI18n();
  const [f, setF] = useState({ type: 'expense', category: 'court', amount: '', note: '', occurred_on: event.event_date || today() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const rows = (finance?.transactions || []).filter((r) => !r.is_voided);
  const cats = f.type === 'income' ? EVENT_INCOME : EVENT_EXPENSE;

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/transactions', {
        owner_type: 'event',
        event_id: event.id,
        type: f.type,
        category: f.category,
        amount: Number(f.amount || 0),
        note: f.note.trim() || null,
        occurred_on: f.occurred_on,
      });
      setF({ ...f, amount: '', note: '' });
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // "Xoá": the ledger only grows, so a deleted entry is voided (kept, struck out, with why).
  async function voidEntry(r) {
    const reason = window.prompt(t('evfin.deleteAsk', { what: describeEntry(r, t) || categoryLabel(r.category, t), amount: formatVnd(r.amount) }));
    if (reason === null) return;
    setError('');
    try {
      await api.post(`/api/transactions/${r.id}/void`, { reason: reason || null });
      onChanged();
    } catch (err) {
      setError(err.payload?.code?.startsWith('linked_') ? t('fin.autoHint') : err.message);
    }
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-3">
        {[
          ['income', finance?.income, 'text-lime-400'],
          ['expense', finance?.expense, 'text-orange-300'],
          ['net', finance?.net, Number(finance?.net) < 0 ? 'text-red-400' : 'text-white'],
        ].map(([k, v, tone]) => (
          <div key={k} className="card !p-3">
            <span className="text-gray-400 text-xs">{k === 'expense' ? t('evfin.expense') : t(`finance.${k}`)}</span>
            <div className={`text-lg md:text-xl font-bold tabular-nums ${tone}`}>{formatVnd(v || 0)}</div>
          </div>
        ))}
      </div>
      <p className="text-gray-400 text-xs mb-3">
        📒 {t('evfin.linked')}{' '}
        <Link href="/finance/ledger" className="text-lime-400 hover:underline">{t('evfin.openLedger')} →</Link>
      </p>

      <form onSubmit={add} className="card mb-4 grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
        <div className="col-span-2 md:col-span-3 grid grid-cols-2 bg-navy-900 border border-navy-700 rounded-lg p-1 text-sm h-[42px]">
          {['income', 'expense'].map((ty) => (
            <button key={ty} type="button" onClick={() => setF({ ...f, type: ty, category: ty === 'income' ? 'other' : 'court' })} className={`rounded-md ${f.type === ty ? (ty === 'income' ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-orange-500 text-white font-semibold') : 'text-gray-400'}`}>
              {sideLabel(ty, t)}
            </button>
          ))}
        </div>
        <select className="input md:col-span-2 h-[42px]" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label={t('fin.category')}>
          {cats.map((c) => <option key={c} value={c}>{categoryLabel(c, t)}</option>)}
        </select>
        <input className="input md:col-span-2 h-[42px] text-right tabular-nums no-spin" type="number" inputMode="numeric" min="1" step="1" required placeholder={t('fin.amount')} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <input className="input md:col-span-2 h-[42px]" type="date" value={f.occurred_on} onChange={(e) => setF({ ...f, occurred_on: e.target.value })} aria-label={t('fin.date')} />
        <input className="input col-span-2 md:col-span-3 h-[42px]" required={f.category === 'other'} placeholder={f.category === 'other' ? t('fin.otherNotePh') : t('fin.note')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <div className="col-span-2 md:col-span-12 flex flex-wrap items-center justify-between gap-2">
          <span className="text-gray-500 text-xs">{t('evfin.costHint')}</span>
          <button className="btn-primary" disabled={busy}>+ {t('fin.addBtn')}</button>
        </div>
        {error && <p className="col-span-2 md:col-span-12 text-red-400 text-sm">{error}</p>}
      </form>

      <div className="card">
        {rows.length === 0 ? (
          <p className="text-gray-500 text-sm">{t('fin.noEntries')}</p>
        ) : (
          <div className="table-wrap">
            <table className="w-full text-sm grid-table !min-w-[30rem]">
              <thead>
                <tr className="text-gray-300 text-left bg-navy-900">
                  <th>{t('fin.date')}</th>
                  <th>{t('fin.category')}</th>
                  <th>{t('evfin.what')}</th>
                  <th className="text-right">{t('fin.amount')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="text-gray-300 whitespace-nowrap">{`${r.occurred_on.slice(8, 10)}/${r.occurred_on.slice(5, 7)}`}</td>
                    <td className="text-gray-200 whitespace-nowrap">
                      {categoryLabel(r.category, t)}
                      {(AUTO.has(r.category) || r.event_cost) && <span className="ml-1.5 text-[10px] rounded border border-navy-600 text-gray-400 px-1">{r.event_cost ? t('evfin.fromForm') : t('fin.auto')}</span>}
                    </td>
                    <td className="text-gray-300 !whitespace-normal break-words">{describeEntry(r, t) || '—'}</td>
                    <td className={`text-right tabular-nums font-semibold whitespace-nowrap ${r.type === 'income' ? 'text-lime-400' : 'text-orange-300'}`}>
                      {r.type === 'income' ? '+' : '−'}{formatVnd(r.amount)}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {!AUTO.has(r.category) && (
                        <>
                          {!r.event_cost && (
                            <button type="button" className="text-gray-200 hover:text-white px-1.5 text-xs" title={t('fin.edit')} aria-label={t('fin.edit')} onClick={() => setEditing(r)}>✏️ {t('fin.edit')}</button>
                          )}
                          <button type="button" className="text-red-400/90 hover:text-red-300 px-1.5 text-xs" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => voidEntry(r)}>🗑 {t('common.delete')}</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && <EditEntry entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </>
  );
}
