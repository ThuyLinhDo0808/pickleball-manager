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
import { categoryLabel, describeEntry, sessionLabel, MANUAL_EXPENSE, MANUAL_INCOME } from '@/lib/finance';

const LABEL = 'block text-xs text-gray-400 mb-1.5';
const AUTO = new Set(['membership', 'event_fee', 'tournament_fee', 'meeting']);

// The categories a Host picks from; an older entry keeps its own as an extra choice.
// `withBalls`: also list "Mua bóng", which only points the Host to the ball store.
function CategorySelect({ type, value, onChange, withBalls = false }) {
  const { t } = useI18n();
  const presets = type === 'income' ? MANUAL_INCOME : withBalls ? [...MANUAL_EXPENSE.slice(0, -1), 'balls', 'other'] : MANUAL_EXPENSE;
  const choices = value && !presets.includes(value) ? [...presets, value] : presets;
  return (
    <select className="input h-[42px]" value={value} onChange={(e) => onChange(e.target.value)}>
      {choices.map((c) => <option key={c} value={c}>{categoryLabel(c, t)}</option>)}
    </select>
  );
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// `events`: sessions the entry can belong to (optional for a club; a Xé Vé entry always
// belongs to one of the kèo). Without a session it goes into the club fund.
function AddEntry({ club, events = [], onDone }) {
  const { t } = useI18n();
  const [f, setF] = useState({ type: 'expense', category: 'court', amount: '', occurred_on: todayYmd(), note: '', event_id: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [calc, setCalc] = useState(false);
  // Balls are bought in the ball store (it adds them to the stock and books the expense).
  const buyingBalls = f.type === 'expense' && f.category === 'balls';

  async function submit(e) {
    e.preventDefault();
    if (buyingBalls) return;
    setBusy(true);
    setError('');
    try {
      if (!club && !f.event_id) throw new Error(t('ledger.pickSession'));
      await api.post('/api/transactions', {
        ...(f.event_id ? { owner_type: 'event', event_id: f.event_id } : { owner_type: 'club', club_id: club.id }),
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
    <form onSubmit={submit} className="card !p-0 mb-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-navy-700">
        <h2 className="text-white font-semibold">✍️ {t('finX.addEntry')}</h2>
        {club && <button type="button" className="btn-secondary text-sm !py-1.5" onClick={() => setCalc(true)}>🧮 {t('calc.title')}</button>}
      </div>
      {/* One row of equal-height fields, labels on top; hints and the button in the footer. */}
      <div className="grid grid-cols-2 md:grid-cols-12 gap-3 px-5 py-4 items-end">
        <div className="col-span-2 md:col-span-2">
          <label className={LABEL}>{t('fin.type')}</label>
          <div className="grid grid-cols-2 bg-navy-900 border border-navy-700 rounded-lg p-1 text-sm h-[42px]">
            {['income', 'expense'].map((ty) => (
              <button
                key={ty}
                type="button"
                onClick={() => setF({ ...f, type: ty, category: ty === 'income' ? 'monthly_fund' : 'court' })}
                className={`rounded-md ${f.type === ty ? (ty === 'income' ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-orange-500 text-white font-semibold') : 'text-gray-400 hover:text-white'}`}
              >
                {t(`analytics.${ty}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-2 md:col-span-3">
          <label className={LABEL}>{t('fin.category')}</label>
          <CategorySelect type={f.type} value={f.category} withBalls onChange={(category) => setF({ ...f, category })} />
        </div>
        <div className="md:col-span-2">
          <label className={LABEL}>{t('fin.amount')}</label>
          <input className="input no-spin h-[42px] text-right tabular-nums" type="number" inputMode="numeric" min="1" step="1" required placeholder="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className={LABEL}>{t('fin.date')}</label>
          <input className="input h-[42px]" type="date" value={f.occurred_on} onChange={(e) => setF({ ...f, occurred_on: e.target.value })} />
        </div>
        <div className="col-span-2 md:col-span-3">
          <label className={LABEL}>{t('fin.note')}{f.category === 'other' && <span className="text-orange-300"> *</span>}</label>
          <input className="input h-[42px]" required={f.category === 'other'} placeholder={f.category === 'other' ? t('fin.otherNotePh') : t('fin.notePh')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
      </div>
      <div className="px-5 pb-4 -mt-1">
        <label className={LABEL}>{t('ledger.session')}</label>
        <select className="input h-[42px]" value={f.event_id} required={!club} onChange={(e) => {
          const ev = events.find((x) => x.id === e.target.value);
          setF({ ...f, event_id: e.target.value, ...(ev ? { occurred_on: ev.event_date } : {}) });
        }}>
          <option value="">{club ? t('ledger.noSession') : t('ledger.pickSession')}</option>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{sessionLabel(ev, t)}</option>)}
        </select>
      </div>
      {buyingBalls && (
        <div className="mx-5 mb-4 rounded-xl border border-orange-400/40 bg-orange-400/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="text-sm text-orange-100 flex-1">
            <div className="font-semibold">🎾 {t('fin.ballsCalloutTitle')}</div>
            <div className="text-orange-200/80 text-xs mt-0.5">{t('fin.ballsCalloutText')}</div>
          </div>
          <Link href="/finance/inventory" className="btn-primary text-sm text-center shrink-0">{t('fin.ballsCalloutBtn')} →</Link>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-navy-700 bg-navy-900/40">
        <div className="text-xs text-gray-400 min-w-0">
          {Number(f.amount) > 0 && !buyingBalls && (
            <span className={`font-semibold tabular-nums mr-3 ${f.type === 'income' ? 'text-lime-300' : 'text-orange-300'}`}>
              {f.type === 'income' ? '+' : '−'}{formatVnd(Number(f.amount))} · {categoryLabel(f.category, t)}
            </span>
          )}
          {f.type === 'expense' && !buyingBalls && (
            <Link href="/finance/inventory" className="inline-flex items-center gap-1 rounded-full border border-navy-600 px-2.5 py-1 text-gray-300 hover:border-lime-400 hover:text-lime-300">
              🎾 {t('fin.ballsLink')} →
            </Link>
          )}
          {error && <span className="block text-red-400 text-sm">{error}</span>}
        </div>
        <button className="btn-primary px-6" disabled={busy || buyingBalls}>+ {t('fin.addBtn')}</button>
      </div>
      <Modal open={calc} title={`🧮 ${t('calc.title')}`} onClose={() => setCalc(false)}>
        {calc && club && (
          <FundCalculator
            club={club}
            onUse={(amount, category) => {
              setF((x) => ({ ...x, type: 'income', category, amount: String(amount) }));
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

  // Sessions an entry can be put on: the club's (or Xé Vé kèo) from 3 months back to 2 ahead.
  const { data: evList } = useLoad(() => {
    if (isClub) return club ? api.get(`/api/clubs/${club.id}/events`) : Promise.resolve([]);
    return api.get('/api/events?scope=standalone');
  }, [isClub, club?.id]);
  const sessions = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 28).toISOString().slice(0, 10);
    return (evList || []).filter((e) => e.kind !== 'meeting' && e.event_date >= from && e.event_date <= to).sort((a, b) => b.event_date.localeCompare(a.event_date));
  }, [evList]);
  const [view, setView] = useState('entries');
  const [source, setSource] = useState('all');
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
      (source === 'all' || (source === 'session') === !!r.event_id) &&
      (category === 'all' || (r.category || 'other') === category)
  );
  const live = shown.filter((r) => !r.is_voided);
  const tin = live.filter((r) => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0);
  const tout = live.filter((r) => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0);
  // "Theo buổi": what each session took in and paid out.
  const bySession = useMemo(() => {
    const m = new Map();
    for (const r of live) {
      if (!r.event_id) continue;
      const x = m.get(r.event_id) || { id: r.event_id, ev: r.events, income: 0, expense: 0, payers: 0 };
      if (r.type === 'income') x.income += Number(r.amount);
      else x.expense += Number(r.amount);
      if (r.category === 'event_fee') x.payers += 1;
      m.set(r.event_id, x);
    }
    return [...m.values()].sort((a, b) => String(b.ev?.event_date).localeCompare(String(a.ev?.event_date)));
  }, [live]);

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
    !r.is_voided && !AUTO.has(r.category) ? (
      <span className="inline-flex gap-1 whitespace-nowrap">
        {!r.event_cost && <button className="text-gray-300 hover:text-white px-1" title={t('fin.edit')} aria-label={t('fin.edit')} onClick={() => setEditing(r)}>✏️</button>}
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
                      {(AUTO.has(r.category) || r.event_cost) && <span className="ml-2 text-[10px] rounded border border-navy-600 text-gray-400 px-1">{r.event_cost ? t('evfin.fromForm') : t('fin.auto')}</span>}
                    </td>
                    <td className={`text-right tabular-nums font-semibold whitespace-nowrap ${income ? 'text-lime-400' : 'text-orange-300'}`}>{formatVnd(r.amount)}</td>
                    <td className="text-gray-400 !whitespace-normal break-words text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          {r.events && (
                            <Link href={`/events/${r.event_id}`} className="text-sky-300 hover:text-lime-400 block">🏓 {sessionLabel(r.events, t)}</Link>
                          )}
                          <span className="text-gray-300">{r.is_voided ? `${t('fin.voided')}${r.void_reason ? `: ${r.void_reason}` : ''}` : describeEntry(r, t) || (r.events ? '' : '—')}</span>
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
      <p className="text-gray-400 text-sm mb-3">📒 {t('ledger.intro')}</p>
      <div className="grid gap-3 mb-4 grid-cols-1 sm:grid-cols-3">
        {[
          ['💚', t('analytics.income'), formatVnd(tin), 'text-lime-400'],
          ['🧾', t('analytics.expense'), formatVnd(tout), 'text-orange-300'],
          ['⚖️', t('finance.net'), formatVnd(tin - tout), tin - tout < 0 ? 'text-red-400' : 'text-white'],
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

      {isClub && data && (
        <p className="text-gray-400 text-xs -mt-2 mb-4">🏦 {t('ledger.fundBalance', { v: formatVnd(data.balance) })}</p>
      )}

      {isClub ? club && <AddEntry club={club} events={sessions} onDone={reload} /> : <AddEntry club={null} events={sessions} onDone={reload} />}

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
        {isClub && (
          <select className="input !w-auto text-sm" value={source} onChange={(e) => setSource(e.target.value)} aria-label={t('ledger.source')}>
            {['all', 'club', 'session'].map((k) => <option key={k} value={k}>{t(`ledger.src_${k}`)}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-300 ml-1">
          <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
          {t('fin.showVoided')}
        </label>
        <div className="ml-auto grid grid-cols-2 bg-navy-900 border border-navy-700 rounded-lg p-1 text-sm">
          {['entries', 'sessions'].map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1 ${view === v ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-300'}`}>
              {t(`ledger.view_${v}`)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="card text-yellow-300 text-sm mb-3">{error}</p>}

      {view === 'entries' ? (
        <div className="grid gap-4 2xl:grid-cols-2 items-start">
          {side('income')}
          {side('expense')}
        </div>
      ) : (
        <div className="card !p-4">
          <h2 className="text-white font-semibold mb-3">🏓 {t('ledger.bySession')} <span className="text-gray-500 font-normal text-sm">({bySession.length})</span></h2>
          {bySession.length === 0 ? (
            <p className="text-gray-500 text-sm">{t('fin.eventPnlNone')}</p>
          ) : (
            <div className="table-wrap">
              <table className="w-full text-sm grid-table !min-w-[32rem]">
                <thead>
                  <tr className="text-gray-300 text-left bg-navy-900">
                    <th>{t('ledger.session')}</th>
                    <th className="text-right">{t('finance.income')}</th>
                    <th className="text-right">{t('finance.expense')}</th>
                    <th className="text-right">{t('finance.net')}</th>
                  </tr>
                </thead>
                <tbody>
                  {bySession.map((x) => (
                    <tr key={x.id}>
                      <td className="!whitespace-normal">
                        <Link href={`/events/${x.id}`} className="text-gray-100 hover:text-lime-400">{sessionLabel(x.ev, t)}</Link>
                        {x.payers > 0 && <span className="block text-gray-500 text-xs">{t('ledger.payers', { n: x.payers })}</span>}
                      </td>
                      <td className="text-right tabular-nums text-lime-400">{formatVnd(x.income)}</td>
                      <td className="text-right tabular-nums text-orange-300">{formatVnd(x.expense)}</td>
                      <td className={`text-right tabular-nums font-semibold ${x.income - x.expense < 0 ? 'text-red-400' : 'text-white'}`}>{formatVnd(x.income - x.expense)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {editing && <EditEntry entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}
