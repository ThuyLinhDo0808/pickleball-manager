'use client';
import { useEffect, useState } from 'react';
import EventControls from '@/components/EventControls';
import EventVotes from '@/components/EventVotes';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';
import { formatVnd } from '@/lib/format';

const TABS = ['details', 'people', 'finance'];

// An amount typed in a table cell; saved when the field loses focus (or on Enter).
function MoneyInput({ value, onSave, label }) {
  const [v, setV] = useState(value ? String(value) : '');
  useEffect(() => setV(value ? String(value) : ''), [value]);
  const save = () => {
    const n = Number(v || 0);
    if (Number.isFinite(n) && n >= 0 && n !== Number(value || 0)) onSave(n);
  };
  return (
    <input
      className="input !py-1 !px-2 text-right tabular-nums w-28"
      type="number"
      inputMode="numeric"
      min="0"
      step="1000"
      placeholder="0"
      aria-label={label}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

const Tile = ({ label, value, tone = 'text-white' }) => (
  <div className="rounded-xl border border-navy-700 bg-navy-900/60 px-3 py-2">
    <div className="text-gray-400 text-xs">{label}</div>
    <div className={`font-bold tabular-nums ${tone}`}>{value}</div>
  </div>
);

// A club meeting / get-together: details + votes, who comes (and their guests), and a
// small cash box settled at the end (surplus into the fund, a deficit covered somehow).
export default function MeetingEvent({ event, onChanged }) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState('details');
  const { data: m, setData: setM, reload } = useLoad(() => api.get(`/api/events/${event.id}/meeting`), [event.id]);
  const [error, setError] = useState('');
  const run = async (fn) => {
    setError('');
    try {
      setM(await fn());
    } catch (err) {
      setError(err.message);
    }
  };
  const coming = (m?.rows || []).filter((r) => r.choice === 'yes');
  const time = [hhmm(event.start_time), hhmm(event.end_time)].filter(Boolean).join(' – ');

  return (
    <>
      <div className="mb-4">
        <p className="text-gray-400 text-xs uppercase tracking-wide">👥 {t('vote.kicker')}</p>
        <h1 className="text-white text-2xl font-bold">{event.title}</h1>
      </div>

      <div role="tablist" className="grid grid-cols-3 gap-1 bg-navy-900 border border-navy-700 rounded-xl p-1 mb-4">
        {TABS.map((tb) => (
          <button
            key={tb}
            role="tab"
            aria-selected={tab === tb}
            onClick={() => {
              setTab(tb);
              if (tb !== 'details') reload();
            }}
            className={`px-2 py-2 rounded-lg text-sm truncate ${tab === tb ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-300 hover:bg-navy-800'}`}
          >
            {tb === 'people' ? `${t('mtg.tabPeople')} (${m ? m.totals.headcount : '…'})` : t(`mtg.tab_${tb}`)}
          </button>
        ))}
      </div>
      {error && <p className="card !py-2 mb-3 text-red-400 text-sm">{error}</p>}

      {tab === 'details' && (
        <>
          <section className="card mb-4 grid gap-3 sm:grid-cols-3">
            <Tile label={`🕒 ${t('mtg.when')}`} value={`${formatDay(event.event_date, lang, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}${time ? ` · ${time}` : ''}`} />
            <Tile label={`📍 ${t('mtg.where')}`} value={event.location || '—'} />
            <Tile label={`💰 ${t('mtg.fee')}`} value={Number(event.fee_amount) > 0 ? `${formatVnd(event.fee_amount)} / ${t('vote.perPerson')}` : t('public.free')} tone="text-lime-300" />
            <div className="sm:col-span-3 rounded-xl border border-navy-700 bg-navy-900/60 px-3 py-2">
              <div className="text-gray-400 text-xs">📋 {t('mtg.agenda')}</div>
              <p className="text-gray-100 text-sm whitespace-pre-line mt-0.5">{event.notice || <span className="text-gray-500">{t('mtg.noAgenda')}</span>}</p>
            </div>
          </section>
          <EventVotes event={event} />
          <EventControls event={event} onChanged={onChanged} />
        </>
      )}

      {tab === 'people' && m && <People event={event} m={m} coming={coming} run={run} />}
      {tab === 'finance' && m && <Finance event={event} m={m} run={run} />}
    </>
  );
}

function People({ event, m, coming, run }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [by, setBy] = useState('');
  const others = m.rows.filter((r) => r.choice !== 'yes');
  async function add(e) {
    e.preventDefault();
    await run(() => api.post(`/api/events/${event.id}/meeting/guests`, { full_name: name, invited_by: by }));
    setName('');
  }
  return (
    <>
      <section className="card mb-4">
        <h2 className="text-white font-semibold mb-2">✓ {t('mtg.attendees', { n: coming.length })}</h2>
        {coming.length === 0 ? (
          <p className="text-gray-400 text-sm">{t('mtg.noAttendees')}</p>
        ) : (
          <ul className="divide-y divide-navy-700">
            {coming.map((r) => (
              <li key={r.club_member_id} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1 min-w-0 truncate text-white">
                  {r.full_name}
                  {r.member_type !== 'fixed' && <span className="text-gray-500 text-xs"> · {t('members.guest')}</span>}
                </span>
                {r.guests > 0 && <span className="text-sky-300 text-xs">+{r.guests} {t('mtg.guestShort')}</span>}
                <span className="text-gray-300 tabular-nums text-xs w-28 text-right">{formatVnd(r.due)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="text-white font-semibold">🎟 {t('mtg.guestsTitle', { n: m.guests.length })}</h2>
        <p className="text-gray-400 text-xs mb-3">{t('mtg.guestsHint', { fee: formatVnd(m.fee + m.extra_per_person) })}</p>
        <form onSubmit={add} className="flex flex-col sm:flex-row gap-2 mb-3">
          <input className="input flex-1" required maxLength={120} placeholder={t('mtg.guestName')} value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input sm:w-64" required value={by} onChange={(e) => setBy(e.target.value)} aria-label={t('mtg.invitedBy')}>
            <option value="">{t('mtg.invitedBy')}…</option>
            {coming.length > 0 && (
              <optgroup label={t('mtg.attendeesShort')}>
                {coming.map((r) => <option key={r.club_member_id} value={r.club_member_id}>{r.full_name}</option>)}
              </optgroup>
            )}
            <optgroup label={t('mtg.otherMembers')}>
              {others.map((r) => <option key={r.club_member_id} value={r.club_member_id}>{r.full_name}</option>)}
            </optgroup>
          </select>
          <button className="btn-primary">{t('common.add')}</button>
        </form>
        {m.guests.length === 0 ? (
          <p className="text-gray-500 text-sm">{t('mtg.noGuests')}</p>
        ) : (
          <table className="w-full text-sm grid-table compact-cells">
            <thead>
              <tr className="text-gray-300 bg-navy-900 text-left">
                <th>{t('mtg.guestCol')}</th>
                <th>{t('mtg.invitedBy')}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {m.guests.map((g) => (
                <tr key={g.id}>
                  <td className="text-white">{g.full_name}</td>
                  <td className="text-gray-300">{g.inviter_name}</td>
                  <td className="text-center">
                    <button type="button" aria-label={t('common.delete')} className="text-gray-400 hover:text-red-300" onClick={() => run(() => api.del(`/api/events/${event.id}/meeting/guests/${g.id}`))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function Finance({ event, m, run }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const [exp, setExp] = useState({ label: '', amount: '' });
  const [sponsor, setSponsor] = useState('');
  const [editing, setEditing] = useState(null);
  const tt = m.totals;
  const rows = all ? m.rows : m.rows.filter((r) => r.choice === 'yes' || r.guests || r.paid_amount || r.sponsor_amount);
  const status = (r) => (r.choice === 'yes' ? 'yes' : r.choice === 'no' ? 'no' : 'none');
  const STATUS_TONE = { yes: 'text-lime-300', no: 'text-red-300', none: 'text-gray-500' };
  const s = m.settlement;
  const settle = (mode, extra = {}) => run(() => api.post(`/api/events/${event.id}/meeting/settle`, { mode, ...extra }));
  const undo = () => run(() => api.del(`/api/events/${event.id}/meeting/settle`));
  const setMoney = (r, patch) => run(() => api.put(`/api/events/${event.id}/meeting/money/${r.club_member_id}`, patch));

  async function addExpense(e) {
    e.preventDefault();
    await run(() => api.post(`/api/events/${event.id}/meeting/expenses`, exp));
    setExp({ label: '', amount: '' });
  }

  return (
    <>
      <section className="card !p-0 overflow-hidden mb-4">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-navy-700">
          <h2 className="text-white font-semibold flex-1">💳 {t('mtg.moneyTitle')}</h2>
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            {t('mtg.showAll')}
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm grid-table compact-cells">
            <thead>
              <tr className="text-gray-300 bg-navy-900 text-left">
                <th>{t('mtg.colName')}</th>
                <th>{t('mtg.colStatus')}</th>
                <th className="text-right">{t('mtg.colDue')}</th>
                <th className="text-right">{t('mtg.colPaid')}</th>
                <th className="text-right">{t('mtg.colSponsor')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.club_member_id}>
                  <td className="text-white whitespace-nowrap">
                    {r.full_name}
                    {r.guests > 0 && <span className="text-sky-300 text-xs"> · +{r.guests} {t('mtg.guestShort')}</span>}
                  </td>
                  <td className={`whitespace-nowrap ${STATUS_TONE[status(r)]}`}>{t(`mtg.status_${status(r)}`)}</td>
                  <td className="text-right tabular-nums text-gray-300 whitespace-nowrap">
                    {r.due ? formatVnd(r.due) : '—'}
                    {r.due > 0 && r.paid_amount >= r.due && <span className="text-lime-400"> ✓</span>}
                  </td>
                  <td className="text-right"><MoneyInput value={r.paid_amount} label={`${t('mtg.colPaid')} · ${r.full_name}`} onSave={(v) => setMoney(r, { paid_amount: v })} /></td>
                  <td className="text-right"><MoneyInput value={r.sponsor_amount} label={`${t('mtg.colSponsor')} · ${r.full_name}`} onSave={(v) => setMoney(r, { sponsor_amount: v })} /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="text-gray-500 text-sm">{t('mtg.noAttendees')}</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-navy-900 text-gray-200 font-semibold">
                <td colSpan={2}>{t('mtg.totals')}</td>
                <td className="text-right tabular-nums">{formatVnd(tt.due)}</td>
                <td className="text-right tabular-nums text-lime-300">{formatVnd(tt.paid)}</td>
                <td className="text-right tabular-nums text-sky-300">{formatVnd(tt.sponsor)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {tt.outstanding > 0 && <p className="px-4 py-2 text-amber-300 text-xs border-t border-navy-700">⏳ {t('mtg.outstanding', { v: formatVnd(tt.outstanding) })}</p>}
      </section>

      <section className="card mb-4">
        <h2 className="text-white font-semibold mb-2">🧾 {t('mtg.expensesTitle')}</h2>
        <form onSubmit={addExpense} className="flex flex-col sm:flex-row gap-2 mb-3">
          <input className="input flex-1" required maxLength={200} placeholder={t('mtg.expenseLabel')} value={exp.label} onChange={(e) => setExp({ ...exp, label: e.target.value })} />
          <input className="input sm:w-40" required type="number" inputMode="numeric" min="0" step="1000" placeholder={t('mtg.amount')} value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} />
          <button className="btn-primary">{t('common.add')}</button>
        </form>
        {m.expenses.length === 0 ? (
          <p className="text-gray-500 text-sm">{t('mtg.noExpenses')}</p>
        ) : (
          <ul className="divide-y divide-navy-700">
            {m.expenses.map((e) =>
              editing?.id === e.id ? (
                <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                  <input className="input flex-1 !py-1" value={editing.label} onChange={(ev) => setEditing({ ...editing, label: ev.target.value })} />
                  <input className="input w-32 !py-1 text-right" type="number" min="0" value={editing.amount} onChange={(ev) => setEditing({ ...editing, amount: ev.target.value })} />
                  <button type="button" className="btn-primary !py-1 text-sm" onClick={async () => { await run(() => api.patch(`/api/events/${event.id}/meeting/expenses/${e.id}`, { label: editing.label, amount: editing.amount })); setEditing(null); }}>{t('common.save')}</button>
                  <button type="button" className="text-gray-400 text-sm" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
                </li>
              ) : (
                <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-gray-100">{e.label}</span>
                  <span className="tabular-nums text-orange-300">−{formatVnd(e.amount)}</span>
                  <button type="button" className="text-gray-400 hover:text-white text-xs" onClick={() => setEditing({ id: e.id, label: e.label, amount: e.amount })}>✏️ {t('mtg.edit')}</button>
                  <button type="button" className="text-red-400 text-xs" onClick={() => run(() => api.del(`/api/events/${event.id}/meeting/expenses/${e.id}`))}>{t('common.delete')}</button>
                </li>
              )
            )}
          </ul>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="text-white font-semibold mb-3">⚖️ {t('mtg.resultTitle')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          <Tile label={t('mtg.totalPaid')} value={formatVnd(tt.paid)} tone="text-lime-300" />
          <Tile label={t('mtg.totalSponsor')} value={formatVnd(tt.sponsor)} tone="text-sky-300" />
          <Tile label={t('mtg.collected')} value={formatVnd(tt.collected)} />
          <Tile label={t('mtg.spent')} value={formatVnd(tt.spent)} tone="text-orange-300" />
          <Tile label={t('mtg.left')} value={`${tt.balance > 0 ? '+' : ''}${formatVnd(tt.balance)}`} tone={tt.balance > 0 ? 'text-lime-400' : tt.balance < 0 ? 'text-red-400' : 'text-white'} />
        </div>

        {s && s.mode !== 'split' ? (
          <div className="rounded-lg border border-lime-400/40 bg-lime-400/5 px-3 py-2 text-sm flex flex-wrap items-center gap-2">
            <span className="flex-1 text-lime-100">
              ✓ {t(`mtg.settled_${s.mode}`, { v: formatVnd(s.amount), name: m.rows.find((r) => r.club_member_id === s.member_id)?.full_name || '' })}
            </span>
            <button type="button" className="text-gray-300 underline text-xs" onClick={undo}>{t('mtg.undo')}</button>
          </div>
        ) : tt.balance > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-gray-300 text-sm flex-1">{t('mtg.surplus', { v: formatVnd(tt.balance) })}</p>
            <button type="button" className="btn-primary text-sm" onClick={() => window.confirm(t('mtg.toFundAsk', { v: formatVnd(tt.balance) })) && settle('to_fund')}>
              🏦 {t('mtg.toFund', { v: formatVnd(tt.balance) })}
            </button>
          </div>
        ) : tt.balance < 0 ? (
          <div>
            <p className="text-red-300 text-sm font-semibold mb-2">⚠️ {t('mtg.deficit', { v: formatVnd(-tt.balance) })}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-navy-600 p-3">
                <div className="text-white text-sm font-semibold mb-1">🤝 {t('mtg.optSponsor')}</div>
                <select className="input text-sm mb-2" value={sponsor} onChange={(e) => setSponsor(e.target.value)} aria-label={t('mtg.optSponsor')}>
                  <option value="">{t('mtg.pickSponsor')}</option>
                  {m.rows.map((r) => <option key={r.club_member_id} value={r.club_member_id}>{r.full_name}</option>)}
                </select>
                <button type="button" className="btn-secondary w-full !py-1.5 text-sm" disabled={!sponsor} onClick={() => settle('sponsor', { member_id: sponsor })}>{t('mtg.apply')}</button>
              </div>
              <div className="rounded-lg border border-navy-600 p-3">
                <div className="text-white text-sm font-semibold mb-1">🏦 {t('mtg.optFund')}</div>
                <p className="text-gray-400 text-xs mb-2">{t('mtg.optFundHint', { v: formatVnd(-tt.balance) })}</p>
                <button type="button" className="btn-secondary w-full !py-1.5 text-sm" onClick={() => window.confirm(t('mtg.fromFundAsk', { v: formatVnd(-tt.balance) })) && settle('from_fund')}>{t('mtg.apply')}</button>
              </div>
              <div className="rounded-lg border border-navy-600 p-3">
                <div className="text-white text-sm font-semibold mb-1">➗ {t('mtg.optSplit')}</div>
                <p className="text-gray-400 text-xs mb-2">
                  {tt.headcount ? t('mtg.optSplitHint', { n: tt.headcount, v: formatVnd(Math.ceil(-tt.balance / tt.headcount / 1000) * 1000) }) : t('mtg.noAttendees')}
                </p>
                <button type="button" className="btn-secondary w-full !py-1.5 text-sm" disabled={!tt.headcount} onClick={() => settle('split')}>{t('mtg.apply')}</button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-300 text-sm">✓ {t('mtg.even')}</p>
        )}
        {s?.mode === 'split' && (
          <p className="mt-3 rounded-lg border border-amber-300/40 bg-amber-300/5 px-3 py-2 text-amber-100 text-sm flex flex-wrap items-center gap-2">
            <span className="flex-1">➗ {t('mtg.splitOn', { v: formatVnd(s.per_person) })}</span>
            <button type="button" className="text-gray-300 underline text-xs" onClick={undo}>{t('mtg.undo')}</button>
          </p>
        )}
      </section>
    </>
  );
}
