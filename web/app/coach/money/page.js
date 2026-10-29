'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import PageHeader from '@/components/ui/PageHeader';
import Hint from '@/components/ui/Hint';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import EmptyState from '@/components/ui/EmptyState';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import DateInput from '@/components/ui/DateInput';
import HostPaymentSettings from '@/components/HostPaymentSettings';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { addDays, addMonths, formatDay, hhmm, monthTitle, todayYmd } from '@/lib/dates';
import { dmy } from '@/lib/coach';
import { sheet, book, fileName } from '@/lib/xlsxBook';
import { CoachGate } from '@/components/coach/CoachGate';
import { StudentLine } from '@/components/coach/StudentRow';

const TABS = ['pending', 'ledger', 'bank'];
const INCOME = ['package', 'session_fee', 'other'];
const EXPENSE = ['refund', 'court', 'equipment', 'other'];
// Last day of a month "YYYY-MM".
const lastDay = (ym) => addDays(addMonths(`${ym}-01`, 1), -1);

// Tiền: students' package orders waiting for the coach (screenshot → Xác nhận / Từ chối),
// per-session fees not collected, the coach's own book by month (auto entries + their own,
// "không tính" tick, void), and where students transfer to.
export default function CoachMoneyPage() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState('pending');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab');
    if (TABS.includes(q)) setTab(q);
  }, []);
  const { data: inbox, error, loading, reload } = useLoad(() => api.get('/api/coach/money'), []);
  const [month, setMonth] = useState(todayYmd().slice(0, 7));
  const from = `${month}-01`;
  const to = lastDay(month);
  const { data: book_, reload: reloadBook } = useLoad(() => (tab === 'ledger' ? api.get(`/api/coach/ledger?from=${from}&to=${to}`) : Promise.resolve(null)), [tab, from, to]);
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState(null); // { p, image }
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ type: 'expense', category: 'court', amount: '', note: '', occurred_on: todayYmd() });
  const [msg, setMsg] = useState('');
  const pending = inbox?.pending || [];
  const fees = inbox?.fees || [];

  async function act(fn) {
    setBusy(true);
    try {
      await fn();
      reload();
      reloadBook();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function openProof(p) {
    try {
      const r = await api.get(`/api/coach/purchases/${p.id}/proof`);
      setProof({ p, image: r.image });
    } catch (err) {
      window.alert(err.message);
    }
  }
  const confirm = (p) => act(() => api.patch(`/api/coach/purchases/${p.id}`, { paid: true })).then(() => setProof(null));
  const reject = (p) => {
    const note = window.prompt(t('coach.rejectAsk'), t('coach.rejectDefault'));
    if (note == null) return;
    act(() => api.post(`/api/coach/purchases/${p.id}/reject`, { note })).then(() => setProof(null));
  };
  async function addEntry(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api.post('/api/coach/ledger', { ...f, amount: Number(f.amount), note: f.note.trim() || null });
      setAdding(false);
      setF({ ...f, amount: '', note: '' });
      reloadBook();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  const rows = book_?.rows || [];
  async function exportXlsx() {
    const live = rows.filter((r) => !r.is_voided);
    const data = live.map((r) => [r.occurred_on, t(r.type === 'income' ? 'xlsx.income' : 'xlsx.expense'), t(`coach.cat_${r.category}`), Number(r.amount), r.student_name || '', [r.note, r.excluded ? t('coach.ledExcluded') : ''].filter(Boolean).join(' · ')]);
    const s = sheet({
      title: `${t('coach.money')} — ${monthTitle(from, lang)}`,
      subtitle: `${dmy(from)} – ${dmy(to)}`,
      columns: [
        { header: t('xlsx.date'), type: 'date' },
        { header: t('xlsx.kind') },
        { header: t('xlsx.category') },
        { header: t('xlsx.amount'), type: 'money' },
        { header: t('coach.students'), width: 24 },
        { header: t('xlsx.notes'), width: 36, wrap: true },
      ],
      rows: data,
      notes: [t('coach.ledXlsxNote')],
    });
    await book([[t('coach.ledger'), s]], fileName('coach', t('coach.ledger'), month));
  }
  const cats = f.type === 'income' ? INCOME.filter((c) => c === 'other') : EXPENSE.filter((c) => c !== 'refund');
  const tabsItems = useMemo(() => [
    { key: 'pending', label: t('coach.moneyPending'), count: pending.length + fees.length || undefined, alert: pending.some((p) => p.has_proof) },
    { key: 'ledger', label: t('coach.ledger') },
    { key: 'bank', label: t('coach.bankTab') },
  ], [t, pending, fees]);

  return (
    <AppShell>
      <CoachGate error={error} reload={reload}>
        <PageHeader icon="wallet" title={t('coach.money')} subtitle={t('coach.moneyLead')} hint={<Hint inline text={t('coach.moneyHint')} />} />
        <UnderlineTabs tabs={tabsItems} value={tab} onChange={setTab} className="mb-4" />
        {loading && !inbox && <LoadingBlock rows={4} className="card" />}
        {error && <ErrorBlock message={error.message} onRetry={reload} />}

        {tab === 'pending' && inbox && (
          <div className="grid gap-4">
            <section className="card !p-0 overflow-hidden">
              <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('coach.ordersTitle')} <span className="text-gray-500 font-normal text-sm">({pending.length})</span></h2>
              {!pending.length && <p className="text-gray-500 text-sm px-4 py-3">{t('coach.ordersNone')}</p>}
              {pending.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0">
                  <div className="flex-1 min-w-[12rem]">
                    <StudentLine s={p.student || { full_name: '—' }} sub={`${p.name} · ${formatVnd(p.price)} · ${p.payment_ref || ''}`} />
                  </div>
                  <span className={`text-[11px] rounded-full px-2 py-0.5 whitespace-nowrap ${p.has_proof ? 'bg-amber-300/15 text-amber-200' : 'bg-navy-700 text-gray-300'}`}>
                    {p.has_proof ? t('coach.orderProof') : p.reject_note ? t('coach.orderRejected') : t('coach.orderNoProof')}
                  </span>
                  <span className="inline-flex gap-1">
                    {p.has_proof && <button type="button" className="text-sky-200 hover:text-white text-xs px-2 min-h-[44px]" onClick={() => openProof(p)}>{t('coach.viewProof')}</button>}
                    {p.has_proof && <button type="button" disabled={busy} className="text-red-300 hover:text-red-200 text-xs px-2 min-h-[44px]" onClick={() => reject(p)}>{t('coach.reject')}</button>}
                    <button type="button" disabled={busy} className="btn-primary text-xs !min-h-[44px]" onClick={() => window.confirm(t('coach.confirmAsk', { amount: formatVnd(p.price) })) && confirm(p)}>{t('coach.confirmMoney')}</button>
                  </span>
                </div>
              ))}
            </section>
            <section className="card !p-0 overflow-hidden">
              <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('coach.feesTitle')} <span className="text-gray-500 font-normal text-sm">({fees.length})</span></h2>
              {!fees.length && <p className="text-gray-500 text-sm px-4 py-3">{t('coach.feesNone')}</p>}
              {fees.map((x) => (
                <div key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0">
                  <div className="flex-1 min-w-[12rem]">
                    <StudentLine s={x.student || { full_name: '—' }} sub={x.session ? `${x.session.class_title || ''} · ${formatDay(x.session.session_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit' })} ${hhmm(x.session.start_time)}` : null} />
                  </div>
                  <span className="text-white tabular-nums text-sm">{formatVnd(x.amount)}</span>
                  <span className="inline-flex gap-1">
                    <button type="button" disabled={busy} className="text-gray-300 hover:text-white text-xs px-2 min-h-[44px]" onClick={() => act(() => api.patch(`/api/coach/fees/${x.id}`, { status: 'free' }))}>{t('coach.feeFree')}</button>
                    <button type="button" disabled={busy} className="btn-primary text-xs !min-h-[44px]" onClick={() => act(() => api.patch(`/api/coach/fees/${x.id}`, { status: 'paid' }))}>{t('coach.feeCollected')}</button>
                  </span>
                </div>
              ))}
            </section>
          </div>
        )}

        {tab === 'ledger' && (
          <div className="grid gap-4">
            <div className="card !p-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <button type="button" className="btn-secondary !px-3" onClick={() => setMonth(addMonths(from, -1).slice(0, 7))} aria-label={t('cal.prev')}>‹</button>
                <button type="button" className="btn-secondary !px-3 text-sm" onClick={() => setMonth(todayYmd().slice(0, 7))}>{t('coach.thisMonth')}</button>
                <button type="button" className="btn-secondary !px-3" onClick={() => setMonth(addMonths(from, 1).slice(0, 7))} aria-label={t('cal.next')}>›</button>
              </div>
              <span className="text-white font-semibold capitalize">{monthTitle(from, lang)}</span>
              <span className="ml-auto flex gap-2">
                <button type="button" className="btn-secondary text-sm" disabled={!rows.length} onClick={exportXlsx}>{t('coach.exportXlsx')}</button>
                <button type="button" className="btn-primary text-sm" onClick={() => setAdding(true)}>+ {t('coach.ledAdd')}</button>
              </span>
            </div>
            {!book_ && <LoadingBlock rows={3} className="card" />}
            {book_ && (
              <>
                <KpiRow cols={3}>
                  <StatTile label={t('coach.ledIncome')} value={formatVnd(book_.income)} tone="text-lime-300" />
                  <StatTile label={t('coach.ledExpense')} value={formatVnd(book_.expense)} tone="text-red-300" />
                  <StatTile label={t('coach.ledNet')} value={formatVnd(book_.net)} tone={book_.net < 0 ? 'text-red-300' : 'text-white'} />
                </KpiRow>
                {!rows.length ? (
                  <EmptyState title={t('coach.ledEmpty')} action={<button type="button" className="btn-primary" onClick={() => setAdding(true)}>+ {t('coach.ledAdd')}</button>}>{t('coach.ledEmptyHint')}</EmptyState>
                ) : (
                  <section className="card !p-0 overflow-hidden">
                    {rows.map((r) => (
                      <div key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 border-b border-navy-700 last:border-b-0 text-sm ${r.is_voided ? 'opacity-50' : ''}`}>
                        <span className="text-gray-400 tabular-nums w-12 shrink-0">{dmy(r.occurred_on)}</span>
                        <span className="flex-1 min-w-[10rem]">
                          <span className={`text-white ${r.is_voided ? 'line-through' : ''}`}>{t(`coach.cat_${r.category}`)}</span>
                          <span className="block text-gray-400 text-xs break-words">{[r.student_name, r.note].filter(Boolean).join(' · ') || '—'}{r.is_voided ? ` · ${t('coach.ledVoided')}` : ''}</span>
                        </span>
                        <span className={`tabular-nums font-semibold text-right min-w-[7rem] ${r.excluded ? 'text-gray-500 line-through' : r.type === 'income' ? 'text-lime-300' : 'text-red-300'}`}>
                          {r.type === 'income' ? '+' : '−'}{formatVnd(r.amount)}
                        </span>
                        {!r.is_voided && (
                          <label className="inline-flex items-center gap-1.5 text-xs text-gray-300 min-h-[44px] cursor-pointer">
                            <input type="checkbox" checked={!!r.excluded} disabled={busy} onChange={(e) => act(() => api.patch(`/api/coach/ledger/${r.id}`, { excluded: e.target.checked }))} />
                            {t('coach.ledExclude')}
                          </label>
                        )}
                        {!r.is_voided && !r.auto && (
                          <button type="button" disabled={busy} className="text-red-300 hover:text-red-200 text-xs px-2 min-h-[44px]" onClick={() => window.confirm(t('coach.ledVoidAsk')) && act(() => api.post(`/api/coach/ledger/${r.id}/void`, {}))}>{t('coach.ledVoid')}</button>
                        )}
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'bank' && (
          <section className="card grid gap-3">
            <div>
              <h2 className="text-white font-semibold">{t('coach.bankTitle')}</h2>
              <p className="text-gray-400 text-sm">{t('coach.bankLead')}</p>
            </div>
            <HostPaymentSettings bare endpoint="/api/coach/bank" />
          </section>
        )}

        <Modal open={!!proof} title={t('coach.proofTitle')} onClose={() => setProof(null)}>
          {proof && (
            <div className="grid gap-3">
              <p className="text-gray-300 text-sm">{proof.p.student?.full_name} · {proof.p.name} · <span className="tabular-nums">{formatVnd(proof.p.price)}</span> · {proof.p.payment_ref}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proof.image} alt={t('coach.proofTitle')} className="w-full max-h-[60vh] object-contain rounded-lg bg-white" />
              <div className="flex justify-end gap-2">
                <button type="button" disabled={busy} className="btn-secondary text-red-300" onClick={() => reject(proof.p)}>{t('coach.reject')}</button>
                <button type="button" disabled={busy} className="btn-primary" onClick={() => confirm(proof.p)}>{t('coach.confirmMoney')}</button>
              </div>
            </div>
          )}
        </Modal>

        <Modal open={adding} title={t('coach.ledAdd')} onClose={() => setAdding(false)}>
          {adding && (
            <form onSubmit={addEntry} className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">{t('xlsx.kind')}</label>
                  <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, category: e.target.value === 'income' ? 'other' : 'court' })}>
                    <option value="income">{t('xlsx.income')}</option>
                    <option value="expense">{t('xlsx.expense')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">{t('xlsx.category')}</label>
                  <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                    {cats.map((c) => <option key={c} value={c}>{t(`coach.cat_${c}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">{t('xlsx.amount')}</label>
                  <input className="input text-right tabular-nums" type="number" min="1000" step="1000" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400">{t('xlsx.date')}</label>
                  <DateInput value={f.occurred_on} onChange={(v) => setF({ ...f, occurred_on: v })} required />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">{t('xlsx.notes')}{f.category === 'other' ? ' *' : ''}</label>
                <input className="input" maxLength={300} required={f.category === 'other'} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
              </div>
              {msg && <p className="text-red-300 text-sm">{msg}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
                <button className="btn-primary" disabled={busy}>{t('common.add')}</button>
              </div>
            </form>
          )}
        </Modal>
      </CoachGate>
    </AppShell>
  );
}
