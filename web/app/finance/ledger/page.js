'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import FundCalculator from '@/components/FundCalculator';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { categoryLabel, EXPENSE_CATEGORIES, MANUAL_INCOME } from '@/lib/finance';

const AUTO = new Set(['membership', 'event_fee', 'tournament_fee', 'meeting']);

// The categories a Host picks from; an older entry keeps its own as an extra choice.
function CategorySelect({ type, value, onChange }) {
  const { t } = useI18n();
  const presets = type === 'income' ? MANUAL_INCOME : EXPENSE_CATEGORIES;
  const choices = value && !presets.includes(value) ? [...presets, value] : presets;
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {choices.map((c) => <option key={c} value={c}>{categoryLabel(c, t)}</option>)}
    </select>
  );
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function AddEntry({ club, onDone }) {
  const { t } = useI18n();
  const [f, setF] = useState({ type: 'expense', category: 'court', amount: '', occurred_on: todayYmd(), note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [calc, setCalc] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/transactions', {
        owner_type: 'club',
        club_id: club.id,
        type: f.type,
        category: f.category.trim() || null,
        amount: Number(f.amount),
        occurred_on: f.occurred_on,
        note: f.note.trim() || null,
      });
      setF({ ...f, amount: '', note: '' });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card !p-5 mb-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
      <div className="col-span-2 md:col-span-6 flex flex-wrap items-center justify-between gap-2 -mb-1">
        <h2 className="text-white font-semibold">✍️ {t('finX.addEntry')}</h2>
        <button type="button" className="btn-secondary text-sm !py-1.5" onClick={() => setCalc(true)}>🧮 {t('calc.title')}</button>
      </div>
      <div className="col-span-2 md:col-span-1">
        <label className="text-xs text-gray-400">{t('fin.type')}</label>
        <div className="grid grid-cols-2 bg-navy-950 rounded-lg p-1 text-sm">
          {['income', 'expense'].map((ty) => (
            <button
              key={ty}
              type="button"
              onClick={() => setF({ ...f, type: ty, category: ty === 'income' ? 'monthly_fund' : 'court' })}
              className={`rounded-md py-1.5 ${f.type === ty ? (ty === 'income' ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-orange-500 text-white font-semibold') : 'text-gray-400'}`}
            >
              {t(`analytics.${ty}`)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-400">{t('fin.category')}</label>
        <CategorySelect type={f.type} value={f.category} onChange={(category) => setF({ ...f, category })} />
      </div>
      <div>
        <label className="text-xs text-gray-400">{t('fin.amount')}</label>
        <input className="input" type="number" inputMode="numeric" min="1" step="1" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
      </div>
      <div>
        <label className="text-xs text-gray-400">{t('fin.date')}</label>
        <input className="input" type="date" value={f.occurred_on} onChange={(e) => setF({ ...f, occurred_on: e.target.value })} />
      </div>
      <div className="col-span-2 md:col-span-1">
        <label className="text-xs text-gray-400">{t('fin.note')}</label>
        <input className="input" required={f.category === 'other'} placeholder={f.category === 'other' ? t('fin.otherNotePh') : ''} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
      <button className="btn-primary col-span-2 md:col-span-1" disabled={busy}>{t('common.add')}</button>
      {error && <p className="col-span-2 md:col-span-6 text-red-400 text-sm">{error}</p>}
      <Modal open={calc} title={`🧮 ${t('calc.title')}`} onClose={() => setCalc(false)}>
        {calc && (
          <FundCalculator
            club={club}
            onUse={(amount) => {
              setF((x) => ({ ...x, type: 'income', category: 'monthly_fund', amount: String(amount) }));
              setCalc(false);
            }}
          />
        )}
      </Modal>
    </form>
  );
}

// Fix an entry. A new amount or type is saved as a corrected entry (the old one is voided,
// so the ledger keeps its history); category, date and note change in place.
function EditEntry({ entry, onClose, onSaved }) {
  const { t } = useI18n();
  const [f, setF] = useState(() => ({ type: entry.type, category: entry.category || '', amount: String(Number(entry.amount)), occurred_on: entry.occurred_on, note: entry.note || '' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.patch(`/api/transactions/${entry.id}`, { type: f.type, category: f.category.trim() || null, amount: Number(f.amount), occurred_on: f.occurred_on, note: f.note.trim() || null });
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
            <button key={ty} type="button" onClick={() => setF({ ...f, type: ty, category: ty === entry.type ? entry.category || 'other' : ty === 'income' ? 'monthly_fund' : 'court' })} className={`rounded-md py-1.5 ${f.type === ty ? (ty === 'income' ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-orange-500 text-white font-semibold') : 'text-gray-400'}`}>
              {t(`analytics.${ty}`)}
            </button>
          ))}
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs text-gray-400">{t('fin.category')}</label>
          <CategorySelect type={f.type} value={f.category} onChange={(category) => setF({ ...f, category })} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs text-gray-400">{t('fin.amount')}</label>
          <input className="input" type="number" inputMode="numeric" min="0" step="1" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs text-gray-400">{t('fin.date')}</label>
          <input className="input" type="date" required value={f.occurred_on} onChange={(e) => setF({ ...f, occurred_on: e.target.value })} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs text-gray-400">{t('fin.note')}</label>
          <input className="input" required={f.category === 'other'} placeholder={f.category === 'other' ? t('fin.otherNotePh') : ''} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
        <p className="col-span-2 text-gray-500 text-xs">{t('fin.editHint')}</p>
        {error && <p className="col-span-2 text-red-400 text-sm">{error}</p>}
        <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary" disabled={busy}>{t('common.save')}</button>
      </form>
    </Modal>
  );
}

// Sổ thu chi: every income/expense entry, filterable. Entries are never deleted, only voided.
export default function LedgerPage() {
  const { t } = useI18n();
  const { workspace } = useWorkspace();
  const { club } = useDefaultClub();
  const isClub = workspace === 'club';
  const { data, loading, reload } = useLoad(() => {
    if (isClub) return club ? api.get(`/api/clubs/${club.id}/fund`) : Promise.resolve(null);
    return api.get('/api/transactions?scope=standalone').then((transactions) => ({ transactions, balance: null }));
  }, [isClub, club?.id]);

  const [month, setMonth] = useState('all');
  const [category, setCategory] = useState('all');
  const [showVoided, setShowVoided] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const rows = data?.transactions || [];
  const months = useMemo(() => [...new Set(rows.map((r) => r.occurred_on.slice(0, 7)))].sort().reverse(), [rows]);
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category || 'other'))], [rows]);
  const shown = rows.filter(
    (r) =>
      (showVoided || !r.is_voided) &&
      (month === 'all' || r.occurred_on.startsWith(month)) &&
      (category === 'all' || (r.category || 'other') === category)
  );
  const live = shown.filter((r) => !r.is_voided);
  const tin = live.filter((r) => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0);
  const tout = live.filter((r) => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0);

  async function voidEntry(r) {
    const reason = window.prompt(t('fin.voidAsk'));
    if (reason === null) return;
    setError('');
    try {
      await api.post(`/api/transactions/${r.id}/void`, { reason: reason || null });
      reload();
    } catch (err) {
      setError(err.payload?.code?.startsWith('linked_') ? t('fin.autoHint') : err.message);
    }
  }

  // One table per side: money in on the left, money out on the right.
  const ROW_ACTIONS = (r) =>
    !r.is_voided && isClub && !AUTO.has(r.category) ? (
      <span className="inline-flex gap-1 whitespace-nowrap">
        <button className="text-gray-300 hover:text-white px-1" title={t('fin.edit')} aria-label={t('fin.edit')} onClick={() => setEditing(r)}>✏️</button>
        <button className="text-red-400/80 hover:text-red-300 px-1" title={t('fin.void')} aria-label={t('fin.void')} onClick={() => voidEntry(r)}>✕</button>
      </span>
    ) : null;
  const side = (ty) => {
    const list = shown.filter((r) => r.type === ty);
    const income = ty === 'income';
    return (
      <div className="card !p-4 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-white font-semibold">{income ? '💚' : '🧾'} {t(`analytics.${ty}`)} <span className="text-gray-500 font-normal text-sm">({list.length})</span></h2>
          <span className={`font-bold tabular-nums ${income ? 'text-lime-400' : 'text-orange-300'}`}>{formatVnd(income ? tin : tout)}</span>
        </div>
        {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
        {!loading && list.length === 0 && <p className="text-gray-500 text-sm">{t('fin.noEntries')}</p>}
        {list.length > 0 && (
          <div className="table-wrap">
            <table className="w-full text-sm grid-table !min-w-[26rem]">
              <thead>
                <tr className="text-gray-300 text-left bg-navy-900">
                  <th>{t('fin.date')}</th>
                  <th>{t('fin.category')}</th>
                  <th className="text-right">{t('fin.amount')}</th>
                  <th>{t('fin.note')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className={r.is_voided ? 'opacity-40 line-through' : ''}>
                    <td className="text-gray-300 whitespace-nowrap">{`${r.occurred_on.slice(8, 10)}/${r.occurred_on.slice(5, 7)}`}</td>
                    <td className="text-gray-200 whitespace-nowrap">
                      {categoryLabel(r.category, t)}
                      {AUTO.has(r.category) && <span className="ml-2 text-[10px] rounded border border-navy-600 text-gray-400 px-1">{t('fin.auto')}</span>}
                    </td>
                    <td className={`text-right tabular-nums font-semibold whitespace-nowrap ${income ? 'text-lime-400' : 'text-orange-300'}`}>{formatVnd(r.amount)}</td>
                    <td className="text-gray-400 !whitespace-normal break-words text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          {r.events && (
                            <Link href={`/events/${r.event_id}`} className="text-gray-300 hover:text-lime-400 block">{t('fin.fromEvent', { title: r.events.title })}</Link>
                          )}
                          {r.is_voided ? `${t('fin.voided')}${r.void_reason ? `: ${r.void_reason}` : ''}` : r.note || (r.events ? '' : '—')}
                        </span>
                        {ROW_ACTIONS(r)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className={`grid gap-3 mb-4 ${isClub ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
        {[
          ['💚', t('analytics.income'), formatVnd(tin), 'text-lime-400'],
          ['🧾', t('analytics.expense'), formatVnd(tout), 'text-orange-300'],
          ...(isClub && data ? [['🏦', t('fin.balance'), formatVnd(data.balance), Number(data.balance) < 0 ? 'text-red-400' : 'text-lime-400']] : []),
        ].map(([icon, k, v, tone]) => (
          <div key={k} className="card !p-4">
            <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wide">
              <span>{k}</span>
              <span aria-hidden="true">{icon}</span>
            </div>
            <div className={`text-xl font-bold tabular-nums mt-1 whitespace-nowrap ${tone}`}>{v}</div>
          </div>
        ))}
      </div>

      {isClub ? club && <AddEntry club={club} onDone={reload} /> : <p className="card text-gray-400 text-sm mb-4">{t('fin.ledgerXeve')}</p>}

      <div className="card !p-3 flex flex-wrap items-center gap-2 mb-3">
        <span className="text-gray-400 text-sm px-1">🔎 {t('finX.filter')}</span>
        <select className="input !w-auto text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">{t('fin.allMonths')}</option>
          {months.map((m) => <option key={m} value={m}>{`${Number(m.slice(5))}/${m.slice(0, 4)}`}</option>)}
        </select>
        <select className="input !w-auto text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">{t('fin.category')}: {t('fin.all')}</option>
          {categories.map((c) => <option key={c} value={c}>{categoryLabel(c, t)}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-300 ml-1">
          <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
          {t('fin.showVoided')}
        </label>
      </div>

      {error && <p className="card text-yellow-300 text-sm mb-3">{error}</p>}

      <div className="grid gap-4 xl:grid-cols-2 items-start">
        {side('income')}
        {side('expense')}
      </div>
      {editing && <EditEntry entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}
