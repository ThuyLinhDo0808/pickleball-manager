'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { categoryLabel, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/finance';

const AUTO = new Set(['membership', 'event_fee', 'tournament_fee']);

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function AddEntry({ club, onDone }) {
  const { t } = useI18n();
  const [f, setF] = useState({ type: 'expense', category: 'court', amount: '', occurred_on: todayYmd(), note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const presets = f.type === 'income' ? INCOME_CATEGORIES.filter((c) => !AUTO.has(c)) : EXPENSE_CATEGORIES;

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
    <form onSubmit={submit} className="card mb-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
      <div className="col-span-2 md:col-span-1">
        <label className="text-xs text-gray-400">{t('fin.type')}</label>
        <div className="grid grid-cols-2 bg-navy-950 rounded-lg p-1 text-sm">
          {['income', 'expense'].map((ty) => (
            <button
              key={ty}
              type="button"
              onClick={() => setF({ ...f, type: ty, category: ty === 'income' ? 'prize' : 'court' })}
              className={`rounded-md py-1.5 ${f.type === ty ? (ty === 'income' ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-orange-500 text-white font-semibold') : 'text-gray-400'}`}
            >
              {t(`analytics.${ty}`)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-400">{t('fin.category')}</label>
        <select
          className="input"
          value={presets.includes(f.category) ? f.category : '__custom'}
          onChange={(e) => setF({ ...f, category: e.target.value === '__custom' ? '' : e.target.value })}
        >
          {presets.filter((c) => c !== 'other').map((c) => <option key={c} value={c}>{categoryLabel(c, t)}</option>)}
          <option value="__custom">{t('fin.customCategory')}</option>
        </select>
        {!presets.includes(f.category) && (
          <input className="input mt-2" autoFocus placeholder={t('fin.categoryPh')} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
        )}
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
        <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
      <button className="btn-primary col-span-2 md:col-span-1" disabled={busy}>{t('common.add')}</button>
      {error && <p className="col-span-2 md:col-span-6 text-red-400 text-sm">{error}</p>}
    </form>
  );
}

// Sổ thu chi: every income/expense entry, filterable. Entries are never deleted, only voided.
export default function LedgerPage() {
  const { t, lang } = useI18n();
  const { workspace } = useWorkspace();
  const { club } = useDefaultClub();
  const isClub = workspace === 'club';
  const { data, loading, reload } = useLoad(() => {
    if (isClub) return club ? api.get(`/api/clubs/${club.id}/fund`) : Promise.resolve(null);
    return api.get('/api/transactions?scope=standalone').then((transactions) => ({ transactions, balance: null }));
  }, [isClub, club?.id]);

  const [type, setType] = useState('all');
  const [month, setMonth] = useState('all');
  const [category, setCategory] = useState('all');
  const [showVoided, setShowVoided] = useState(false);
  const [error, setError] = useState('');

  const rows = data?.transactions || [];
  const months = useMemo(() => [...new Set(rows.map((r) => r.occurred_on.slice(0, 7)))].sort().reverse(), [rows]);
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category || 'other'))], [rows]);
  const shown = rows.filter(
    (r) =>
      (showVoided || !r.is_voided) &&
      (type === 'all' || r.type === type) &&
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

  return (
    <>
      {isClub ? club && <AddEntry club={club} onDone={reload} /> : <p className="text-gray-400 text-sm mb-4">{t('fin.ledgerXeve')}</p>}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select className="input !w-auto text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">{t('fin.all')}</option>
          <option value="income">{t('analytics.income')}</option>
          <option value="expense">{t('analytics.expense')}</option>
        </select>
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
        {isClub && data && (
          <span className="ml-auto text-sm text-gray-400">
            {t('fin.balance')}: <span className={`font-bold ${Number(data.balance) >= 0 ? 'text-lime-400' : 'text-red-400'}`}>{formatVnd(data.balance)}</span>
          </span>
        )}
      </div>

      <p className="text-gray-300 text-sm mb-2">{t('fin.totalShown', { in: formatVnd(tin), out: formatVnd(tout), net: formatVnd(tin - tout) })}</p>
      {error && <p className="card text-yellow-300 text-sm mb-3">{error}</p>}

      <div className="card">
        {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
        {!loading && shown.length === 0 && <p className="text-gray-400 text-sm">{t('fin.noEntries')}</p>}
        {shown.length > 0 && (
          <div className="table-wrap">
            <table className="w-full text-sm grid-table">
              <thead>
                <tr className="text-gray-300 text-left bg-navy-900">
                  <th>{t('fin.date')}</th>
                  <th>{t('fin.category')}</th>
                  <th className="text-right">{t('fin.amount')}</th>
                  <th>{t('fin.note')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className={r.is_voided ? 'opacity-40 line-through' : ''}>
                    <td className="text-gray-300">{new Date(`${r.occurred_on}T00:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB')}</td>
                    <td className="text-gray-200">
                      {categoryLabel(r.category, t)}
                      {AUTO.has(r.category) && <span className="ml-2 text-[10px] rounded border border-navy-600 text-gray-400 px-1">{t('fin.auto')}</span>}
                    </td>
                    <td className={`text-right tabular-nums font-semibold ${r.type === 'income' ? 'text-lime-400' : 'text-orange-300'}`}>
                      {r.type === 'income' ? '+' : '−'}{formatVnd(r.amount)}
                    </td>
                    <td className="text-gray-400 whitespace-normal min-w-[10rem]">
                      {r.events && (
                        <Link href={`/events/${r.event_id}`} className="text-gray-300 hover:text-lime-400 block">{t('fin.fromEvent', { title: r.events.title })}</Link>
                      )}
                      {r.is_voided ? `${t('fin.voided')}${r.void_reason ? `: ${r.void_reason}` : ''}` : r.note || (r.events ? '' : '—')}
                    </td>
                    <td className="text-right">
                      {!r.is_voided && isClub && !AUTO.has(r.category) && (
                        <button className="text-red-400/80 text-xs" onClick={() => voidEntry(r)}>{t('fin.void')}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
