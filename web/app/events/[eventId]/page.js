'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import EventShareCard from '@/components/EventShareCard';
import Modal from '@/components/Modal';
import MatchForm from '@/components/MatchForm';
import MatchList from '@/components/MatchList';
import QrCheckinPanel from '@/components/QrCheckinPanel';
import PaymentReview from '@/components/PaymentReview';
import EventControls from '@/components/EventControls';
import EventSurveys from '@/components/EventSurveys';
import EventShuttles from '@/components/EventShuttles';
import PlayerChip from '@/components/PlayerChip';
import { exportMatchesJpg } from '@/lib/matchImage';
import { formatDay, hhmm } from '@/lib/dates';
import { formatVnd } from '@/lib/format';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useClubs } from '@/context/ClubContext';
import { exportEventFinance } from '@/lib/exportExcel';

export default function EventDetailPage() {
  const { eventId } = useParams();
  const { t, lang, sport } = useI18n();
  const { club } = useDefaultClub();
  // Four tabs: details (status, sign-up link, deadlines), players, matches, money.
  const [tab, setTab] = useState('details');
  const [showQr, setShowQr] = useState(false);

  const { data: event, reload: reloadEvent, setData: setEvent } = useLoad(() => api.get(`/api/events/${eventId}`), [eventId]);
  // Opened from the all-clubs calendar: switch to the event's club so the page speaks its
  // sport (levels, scoring, shuttles) and imports from the right member list.
  const { clubs, selectClub } = useClubs();
  useEffect(() => {
    if (event?.club_id && club?.id !== event.club_id && clubs.some((c) => c.id === event.club_id)) selectClub(event.club_id);
  }, [event?.club_id, club?.id, clubs, selectClub]);
  const { data: participants, reload: reloadParticipants } = useLoad(
    () => api.get(`/api/events/${eventId}/participants`),
    [eventId]
  );
  const { data: finance, reload: reloadFinance } = useLoad(() => api.get(`/api/events/${eventId}/finance`), [eventId]);
  // Import from the club the event belongs to, falling back to the selected club.
  const importClubId = event?.club_id || club?.id;
  const { data: clubMembers } = useLoad(
    () => (importClubId ? api.get(`/api/clubs/${importClubId}/members`) : Promise.resolve([])),
    [importClubId]
  );

  const [form, setForm] = useState({ full_name: '', phone: '' });
  const [showImport, setShowImport] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [flash, setFlash] = useState('');
  const [showMatch, setShowMatch] = useState(false);
  const { data: matches, reload: reloadMatches } = useLoad(() => api.get(`/api/matches?event_id=${eventId}`), [eventId]);
  const [txnForm, setTxnForm] = useState({ type: 'expense', category: '', amount: '', note: '' });

  async function addParticipant(e) {
    e.preventDefault();
    await api.post(`/api/events/${eventId}/participants`, form);
    setForm({ full_name: '', phone: '' });
    reloadParticipants();
    reloadEvent();
  }

  async function doAction(p, action) {
    let res;
    try {
      res = await api.post(`/api/events/${eventId}/participants/${p.id}/${action}`, {});
    } catch (err) {
      setFlash(err.message);
      return;
    }
    if (action === 'cancel') {
      const parts = [res.late ? t('policy.cancelledLate', { name: p.full_name }) : t('policy.cancelledFree', { name: p.full_name })];
      if (res.promoted) parts.push(t('policy.promoted', { name: res.promoted.full_name }));
      setFlash(parts.join(' '));
    }
    if (action === 'promote') setFlash(t('policy.promoted', { name: p.full_name }));
    if (action === 'check-in' && p.source_club_member_id && event?.club_id) {
      const pass = res?.pass;
      setFlash(
        !pass
          ? t('events.noPass', { name: p.full_name })
          : pass.unlimited
            ? t('events.passUnlimited', { name: p.full_name, period: pass.period_label })
            : t('events.passLeft', { name: p.full_name, period: pass.period_label, n: pass.sessions_remaining })
      );
    }
    reloadParticipants();
    reloadEvent();
    reloadFinance();
  }

  async function toggleFee(p) {
    if (p.status === 'cancelled' && p.fee_paid && !window.confirm(t('slot.refundAsk', { name: p.full_name }))) return;
    await api.post(`/api/events/${eventId}/participants/${p.id}/fee`, { fee_paid: !p.fee_paid });
    reloadParticipants();
    reloadFinance();
  }

  async function importFromClub() {
    if (!selectedIds.length) return;
    await api.post(`/api/events/${eventId}/participants/import`, { club_member_ids: selectedIds });
    setSelectedIds([]);
    setShowImport(false);
    reloadParticipants();
    reloadEvent();
  }

  async function addTxn(e) {
    e.preventDefault();
    await api.post('/api/transactions', {
      owner_type: 'event',
      event_id: eventId,
      type: txnForm.type,
      category: txnForm.category || null,
      amount: Number(txnForm.amount || 0),
      note: txnForm.note || null,
    });
    setTxnForm({ type: 'expense', category: '', amount: '', note: '' });
    reloadFinance();
  }

  function onExport() {
    if (!event || !participants || !finance) return;
    exportEventFinance(event, participants, finance.transactions || []);
  }

  if (!event) return <AppShell><p className="text-gray-400">{t('common.loading')}</p></AppShell>;

  const main = (participants || []).filter((p) => ['registered', 'checked_in', 'no_show'].includes(p.status));
  const pending = (participants || []).filter((p) => p.status === 'pending');
  // Guests with a perk go first off the waitlist, so show them first.
  const waitlist = (participants || []).filter((p) => p.status === 'waitlisted').sort((a, b) => Number(!!b.priority) - Number(!!a.priority));
  const cancelled = (participants || []).filter((p) => p.status === 'cancelled');
  const counts = {
    arrived: main.filter((p) => p.status === 'checked_in').length,
    confirmed: main.filter((p) => p.status !== 'no_show').length,
    toReview: pending.filter((p) => p.payment_status === 'proof_submitted').length,
    toPay: pending.filter((p) => p.payment_status !== 'proof_submitted').length,
    absent: main.filter((p) => p.status === 'no_show').length,
  };


  const refresh = () => {
    reloadParticipants();
    reloadEvent();
  };

  return (
    <AppShell>
      <div className="flex justify-between items-start gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-white text-2xl font-bold">{event.title}</h1>
          <p className="text-gray-400 text-sm">
            {formatDay(event.event_date, lang, { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })}
            {event.start_time && ` · ${hhmm(event.start_time)}${event.end_time ? `–${hhmm(event.end_time)}` : ''}`} · {event.location || '—'}
          </p>
          <p className="text-gray-500 text-xs mt-0.5">
            {event.cancel_deadline_hours == null ? t('policy.noneShort') : t('policy.short', { h: event.cancel_deadline_hours })}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <button className="btn-primary text-sm" onClick={() => setShowQr(true)}>📷 {t('qr.scan')}</button>
          <button className="btn-secondary text-sm" onClick={onExport}>{t('common.exportExcel')}</button>
        </div>
      </div>
      <Modal open={showQr} title={t('qr.scanTitle')} onClose={() => setShowQr(false)}>
        {showQr && <QrCheckinPanel endpoint={`/api/events/${eventId}/checkin-code`} onCheckedIn={refresh} />}
      </Modal>

      <div role="tablist" className="grid grid-cols-4 gap-1 bg-navy-900 border border-navy-700 rounded-xl p-1 mb-4">
        {['details', 'participants', 'matches', 'finance'].map((tb) => (
          <button
            key={tb}
            role="tab"
            aria-selected={tab === tb}
            onClick={() => setTab(tb)}
            className={`px-2 py-2 rounded-lg text-sm truncate ${tab === tb ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-300 hover:bg-navy-800'}`}
          >
            {tb === 'details' ? t('events.tabDetails') : tb === 'participants' ? `${t('nav.members')} (${main.length})` : tb === 'matches' ? `${t('matches.title')} (${(matches || []).length})` : t('nav.finance')}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <>
          <EventControls event={event} onChanged={setEvent} />
          <EventShareCard event={event} onSaved={setEvent} />
        </>
      )}

      {tab === 'participants' && (
        <>
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <form onSubmit={addParticipant} className="card flex-1 flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1">
                <label className="text-xs text-gray-400">{t('common.name')}</label>
                <input className="input" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400">{t('common.phone')}</label>
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <button className="btn-primary">{t('common.add')}</button>
            </form>
            <button className="btn-secondary" onClick={() => setShowImport(!showImport)}>{t('events.importFromClub')}</button>
          </div>

          {showImport && (
            <div className="card mb-4">
              <p className="text-gray-400 text-sm mb-2">{t('events.importFromClub')}</p>
              <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                {(clubMembers || []).filter((m) => m.is_active).map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm text-gray-200">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(m.id)}
                      onChange={(e) =>
                        setSelectedIds(e.target.checked ? [...selectedIds, m.id] : selectedIds.filter((id) => id !== m.id))
                      }
                    />
                    {m.full_name}
                  </label>
                ))}
              </div>
              <button className="btn-primary mt-3" onClick={importFromClub}>{t('common.add')} ({selectedIds.length})</button>
            </div>
          )}

          {flash && (
            <div className="card mb-4 border-lime-400/50 text-lime-300 text-sm flex items-center justify-between gap-3">
              <span>{flash}</span>
              <button className="text-gray-400 text-lg leading-none" aria-label="Close" onClick={() => setFlash('')}>×</button>
            </div>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
            {[
              ['arrived', `${counts.arrived}/${counts.confirmed}`, 'text-lime-400'],
              ['confirmed', `${counts.confirmed + pending.length}/${event.slots}`, 'text-white'],
              ['toReview', counts.toReview, counts.toReview ? 'text-sky-300' : 'text-gray-500'],
              ['toPay', counts.toPay, counts.toPay ? 'text-yellow-300' : 'text-gray-500'],
              ['waitlist', waitlist.length, 'text-gray-300'],
            ].map(([k, v, tone]) => (
              <div key={k} className="card !p-2 text-center">
                <div className={`text-lg font-bold tabular-nums ${tone}`}>{v}</div>
                <div className="text-gray-400 text-[11px] leading-tight">{t(`court.${k}`)}</div>
              </div>
            ))}
          </div>
          {event.club_id && sport === 'badminton' && <EventShuttles event={event} />}
          <PaymentReview event={event} rows={pending} onChanged={() => { refresh(); reloadFinance(); }} />
          <ParticipantTable kind="main" title={`${t('events.mainList')} · ${counts.confirmed}/${event.slots}${pending.length ? ` (+${pending.length} ${t('court.holding')})` : ''}`} rows={main} t={t} onAction={doAction} onFee={toggleFee} />
          <ParticipantTable kind="waitlist" title={`${t('events.waitlist')} (${waitlist.length})`} rows={waitlist} t={t} onAction={doAction} onFee={toggleFee} />
          {cancelled.length > 0 && (
            <ParticipantTable kind="cancelled" title={`${t('policy.cancelledList')} (${cancelled.length})`} rows={cancelled} t={t} onAction={doAction} onFee={toggleFee} fee={event.fee_amount} />
          )}
          {event.club_id && <EventSurveys eventId={event.id} />}
        </>
      )}

      {tab === 'matches' && (
        <>
          <div className="flex flex-wrap justify-end gap-2 mb-3">
            <button
              className="btn-secondary text-sm"
              disabled={!(matches || []).length}
              onClick={() => exportMatchesJpg({ event, matches: matches || [], t, lang })}
            >
              🖼 {t('matches.exportJpg')}
            </button>
            <button className="btn-primary text-sm" onClick={() => setShowMatch(true)}>+ {t('matches.add')}</button>
          </div>
          <MatchList matches={matches || []} onChanged={reloadMatches} />
          <Modal open={showMatch} title={t('matches.add')} onClose={() => setShowMatch(false)}>
            {showMatch && (
              <MatchForm
                players={main.map((p) => ({ id: p.id, name: p.full_name }))}
                idField="event_participant_id"
                parent={{ event_id: eventId }}
                onCancel={() => setShowMatch(false)}
                onSaved={() => {
                  setShowMatch(false);
                  reloadMatches();
                }}
              />
            )}
          </Modal>
        </>
      )}

      {tab === 'finance' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-4">
            <div className="card"><span className="text-gray-400 text-xs">{t('finance.income')}</span><div className="text-lime-400 text-xl font-bold">{(finance?.income || 0).toLocaleString('vi-VN')} ₫</div></div>
            <div className="card"><span className="text-gray-400 text-xs">{t('finance.expense')}</span><div className="text-red-400 text-xl font-bold">{(finance?.expense || 0).toLocaleString('vi-VN')} ₫</div></div>
            <div className="card"><span className="text-gray-400 text-xs">{t('finance.net')}</span><div className="text-white text-xl font-bold">{(finance?.net || 0).toLocaleString('vi-VN')} ₫</div></div>
          </div>

          <form onSubmit={addTxn} className="card mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <select className="input" value={txnForm.type} onChange={(e) => setTxnForm({ ...txnForm, type: e.target.value })}>
              <option value="income">{t('finance.income')}</option>
              <option value="expense">{t('finance.expense')}</option>
            </select>
            <input className="input" placeholder="Category (e.g. balls 40-hole)" value={txnForm.category} onChange={(e) => setTxnForm({ ...txnForm, category: e.target.value })} />
            <input className="input" type="number" placeholder="Amount" required value={txnForm.amount} onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })} />
            <input className="input" placeholder="Note" value={txnForm.note} onChange={(e) => setTxnForm({ ...txnForm, note: e.target.value })} />
            <button className="btn-primary md:col-span-4">{t('common.add')}</button>
          </form>

          <div className="card">
            <div className="table-wrap">
              <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-left border-b border-navy-700">
                  <th className="py-2">Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Note</th>
                </tr>
              </thead>
              <tbody>
                {(finance?.transactions || []).map((tx) => (
                  <tr key={tx.id} className={`border-b border-navy-800 ${tx.is_voided ? 'opacity-40 line-through' : ''}`}>
                    <td className="py-2 text-gray-300">{tx.occurred_on}</td>
                    <td className={tx.type === 'income' ? 'text-lime-400' : 'text-red-400'}>{t(`finance.${tx.type}`)}</td>
                    <td className="text-gray-300">{tx.category || '—'}</td>
                    <td className="text-gray-300">{Number(tx.amount).toLocaleString('vi-VN')} ₫</td>
                    <td className="text-gray-300">{tx.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

const STATUS_TONE = { checked_in: 'text-lime-400', registered: 'text-gray-300', no_show: 'text-yellow-400', waitlisted: 'text-sky-300', cancelled: 'text-gray-500' };

function ParticipantTable({ kind, title, rows, t, onAction, onFee, fee }) {
  return (
    <div className="card mb-4">
      <h3 className="text-white font-semibold mb-2">{title}</h3>
      {kind === 'cancelled' && <p className="text-gray-500 text-xs mb-2">{t('policy.cancelledHint')}</p>}
      {rows.length === 0 && <p className="text-gray-400 text-sm">—</p>}
      <div className="table-wrap">
        <table className="w-full text-sm">
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-navy-800">
              <td className="py-2">
                <PlayerChip
                  name={p.full_name}
                  card={p.card}
                  badges={
                    <>
                      {p.card?.member_type === 'fixed' && (
                        <span className="text-[10px] rounded border border-lime-400/50 text-lime-300 px-1">{t('events.fixedMember')}</span>
                      )}
                      {p.card?.member_type !== 'fixed' && (p.source_club_member_id || p.user_id || p.card?.member_type) && (
                        <span className="text-[10px] rounded border border-navy-500 text-gray-300 px-1">{t('review.kind_guest')}</span>
                      )}
                      {p.priority && (
                        <span className="text-[10px] rounded border border-sky-400/60 text-sky-300 px-1" title={t('guests.priorityMeans')}>⚡ {t('guests.perk_priority')}</span>
                      )}
                      {p.late_cancel && (
                        <span className="text-[10px] rounded border border-orange-400/60 text-orange-300 px-1">{t('policy.lateBadge')}</span>
                      )}
                      {kind === 'cancelled' && p.fee_paid && !p.late_cancel && (
                        <span className="text-[10px] rounded border border-sky-400/60 text-sky-300 px-1">{t('slot.refundDue')}</span>
                      )}
                    </>
                  }
                />
                {p.transferred_from && <div className="text-gray-500 text-[11px] mt-0.5">{t('slot.from', { name: p.transferred_from })}</div>}
              </td>
              <td className={`text-xs ${STATUS_TONE[p.status]}`}>{t(`player.status_${p.status}`)}</td>
              <td>
                {p.paid_by_plan && kind !== 'cancelled' ? (
                  <span className="text-xs text-lime-400" title={t('events.paidByPlanHint')}>{t('events.paidByPlan')}</span>
                ) : (kind !== 'cancelled' || p.late_cancel || p.fee_paid) && (
                  <button className={`text-xs mr-2 ${p.fee_paid ? 'text-lime-400' : 'text-gray-300'}`} onClick={() => onFee(p)}>
                    {kind === 'cancelled' && p.fee_paid && !p.late_cancel ? t('slot.markRefunded') : p.fee_paid ? t('common.paid') : t('common.unpaid')}
                    {kind === 'cancelled' && !p.fee_paid && Number(p.fee_amount ?? fee) > 0 && ` · ${formatVnd(p.fee_amount ?? fee)}`}
                  </button>
                )}
              </td>
              <td className="text-right">
                {kind === 'main' && (
                  <>
                    {p.status !== 'checked_in' && (
                      <button className="text-lime-400 text-xs mr-2" onClick={() => onAction(p, 'check-in')}>{t('events.checkIn')}</button>
                    )}
                    {p.status !== 'no_show' && (
                      <button className="text-yellow-400 text-xs mr-2" onClick={() => onAction(p, 'no-show')}>{t('events.noShow')}</button>
                    )}
                    {p.status !== 'registered' && (
                      <button className="text-gray-400 text-xs mr-2" onClick={() => onAction(p, 'reset')}>{t('staffView.undo')}</button>
                    )}
                  </>
                )}
                {kind === 'waitlist' && (
                  <button className="text-sky-300 text-xs mr-2" onClick={() => onAction(p, 'promote')}>{t('policy.promote')}</button>
                )}
                {kind === 'cancelled' && p.late_cancel && (
                  <button className="text-orange-300 text-xs" onClick={() => window.confirm(t('policy.waiveAsk', { name: p.full_name })) && onAction(p, 'waive')}>
                    {t('policy.waive')}
                  </button>
                )}
                {kind !== 'cancelled' && (
                  <button className="text-red-400 text-xs" onClick={() => window.confirm(t('policy.cancelAsk', { name: p.full_name })) && onAction(p, 'cancel')}>
                    {t('events.cancel')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </div>
  );
}
