'use client';
import DuprExport from '@/components/DuprExport';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import EventShareCard from '@/components/EventShareCard';
import QuickInviteCard from '@/components/QuickInviteCard';
import Modal from '@/components/Modal';
import MatchForm from '@/components/MatchForm';
import MatchList from '@/components/MatchList';
import QrCheckinPanel from '@/components/QrCheckinPanel';
import PaymentReview from '@/components/PaymentReview';
import { HostTicketPasses } from '@/components/TicketPass';
import EventControls from '@/components/EventControls';
import EventSurveys from '@/components/EventSurveys';
import MeetingEvent from '@/components/MeetingEvent';
import EventShuttles from '@/components/EventShuttles';
import { Avatar } from '@/components/PlayerChip';
import { levelText } from '@/lib/levels';
import EventFinance from '@/components/EventFinance';
import { AutoApproveToggle, OrganizersSection, PlaceSheet, RequestsSection } from '@/components/EventPeople';
import MapLink from '@/components/MapLink';
import { exportMatchesJpg } from '@/lib/matchImage';
import { formatDay, hhmm, localDate } from '@/lib/dates';
import { formatVnd } from '@/lib/format';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useClubs } from '@/context/ClubContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { exportEventFinance } from '@/lib/exportExcel';
import { planFor, hasFeature, lockedNotice } from '@/lib/planFeatures';
import { CancelDialog, CancelHistoryBadge, CancelLine } from '@/components/CancelHistory';
import { deadlinesOf, eventStartMs, policyText, refundIfCancelNow } from '@/lib/cancelPolicy';
import Hint from '@/components/ui/Hint';

export default function EventDetailPage() {
  const { eventId } = useParams();
  const { t, lang, sport } = useI18n();
  const { club } = useDefaultClub();
  // Four tabs: details (status, sign-up link, deadlines), players, matches, money.
  // Opens on the players: what the Host checks most. Settings (link, open / close) last.
  const [tab, setTab] = useState('participants');
  const [linkCopied, setLinkCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  // Back from "Sửa thông tin" (?saved=1): say the changes were saved.
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get('saved')) return undefined;
    setJustSaved(true);
    window.history.replaceState(null, '', window.location.pathname);
    const id = setTimeout(() => setJustSaved(false), 5000);
    return () => clearTimeout(id);
  }, []);

  const { data: event, reload: reloadEvent, setData: setEvent } = useLoad(() => api.get(`/api/events/${eventId}`), [eventId]);
  // Opened from the all-clubs calendar: switch to the event's club so the page speaks its
  // sport (levels, scoring, shuttles) and imports from the right member list.
  // A community's kèo opens in Social Manager, a club's session in Club Manager.
  const { allClubs, selectClub } = useClubs();
  const { workspace, setWorkspace, plan } = useWorkspace();
  useEffect(() => {
    const owner = event?.club_id ? allClubs.find((c) => c.id === event.club_id) : null;
    if (!owner) return;
    const ws = owner.kind === 'community' ? 'xeve' : 'club';
    if (workspace !== 'staff' && workspace !== ws) setWorkspace(ws);
    if (club?.id !== owner.id) selectClub(owner.id);
  }, [event?.club_id, club?.id, allClubs, selectClub, workspace, setWorkspace]);
  const ownerKind = event?.club_id ? allClubs.find((c) => c.id === event.club_id)?.kind || 'club' : null;
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
  // The place sheet on a name: { person (row or null for the Host without one), isHost }.
  const [sheet, setSheet] = useState(null);
  const { data: matches, reload: reloadMatches } = useLoad(() => api.get(`/api/matches?event_id=${eventId}`), [eventId]);

  async function addParticipant(e) {
    e.preventDefault();
    await api.post(`/api/events/${eventId}/participants`, form);
    setForm({ full_name: '', phone: '' });
    setShowImport(false);
    reloadParticipants();
    reloadEvent();
  }

  // "📤 Gửi link": copy the sign-up link in one tap (to paste into Zalo / Messenger).
  async function copyLink() {
    const link = `${window.location.origin}/e/${event.short_code || event.public_token}`;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      window.prompt(t('events.copyLink'), link);
    }
  }

  async function doAction(p, action, body = {}) {
    let res;
    try {
      res = await api.post(`/api/events/${eventId}/participants/${p.id}/${action}`, body);
    } catch (err) {
      setFlash(err.message);
      return;
    }
    if (action === 'cancel') {
      const pct = res.refund_percent ?? (res.late ? 0 : 100);
      const parts = [pct === 100 ? t('policy.cancelledFree', { name: p.full_name }) : pct === 50 ? t('cancelx.hostDoneHalf', { name: p.full_name }) : t('policy.cancelledLate', { name: p.full_name })];
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

  // The Host cancels for someone: the dialog shows the refund tier and asks why.
  const [cancelP, setCancelP] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const askCancel = (p) => setCancelP(p);
  async function confirmCancel(reason) {
    setCancelBusy(true);
    await doAction(cancelP, 'cancel', { reason });
    setCancelBusy(false);
    setCancelP(null);
  }

  // Quick buttons on a request: confirm (main list) or put on the waitlist.
  async function placeTo(p, to) {
    try {
      await api.post(`/api/events/${eventId}/participants/${p.id}/place`, { to });
    } catch (err) {
      setFlash(err.payload?.code === 'full' ? t('place.full') : err.message);
    }
    reloadParticipants();
    reloadEvent();
  }
  const openSheet = (p, isHost = false) => setSheet({ person: p, isHost: isHost || (p && p.user_id === event?.host_id) });

  async function toggleFee(p) {
    if (p.status === 'cancelled' && p.fee_paid && !window.confirm(t('slot.refundAsk', { name: p.full_name }))) return;
    await api.post(`/api/events/${eventId}/participants/${p.id}/fee`, { fee_paid: !p.fee_paid });
    reloadParticipants();
    reloadFinance();
  }

  // Paid, then cancelled in time: mark the money as given back (kept with when / how much,
  // and written to the ledger as an expense), or take the mark back.
  async function refund(p, undo = false) {
    try {
      if (undo) {
        if (!window.confirm(t('slot.refundUndoAsk', { name: p.full_name }))) return;
        await api.post(`/api/events/${eventId}/participants/${p.id}/refund-undo`, {});
      } else {
        const def = Math.round((Number(p.fee_amount ?? event?.fee_amount ?? 0) * shareOf(p)) / 100);
        const v = window.prompt(t('slot.refundAmountAsk', { name: p.full_name }), String(def));
        if (v == null) return;
        const amount = Number(String(v).replace(/\D/g, '')) || 0;
        await api.post(`/api/events/${eventId}/participants/${p.id}/refund`, { amount });
      }
      reloadParticipants();
      reloadFinance();
    } catch (err) {
      setFlash(err.message);
    }
  }

  async function importFromClub() {
    if (!selectedIds.length) return;
    try {
      await api.post(`/api/events/${eventId}/participants/import`, { club_member_ids: selectedIds });
    } catch (err) {
      setFlash(err.payload?.code === 'already_on_event' ? t('events.alreadyOnEvent') : err.message);
    }
    setSelectedIds([]);
    setShowImport(false);
    reloadParticipants();
    reloadEvent();
  }

  function onExport() {
    if (!event || !participants || !finance) return;
    if (event.club_id && !hasFeature(planFor(club, plan), 'excel_export')) return lockedNotice('excel_export');
    exportEventFinance(event, participants, finance.transactions || [], t);
  }

  if (!event) return <AppShell><p className="text-gray-400">{t('common.loading')}</p></AppShell>;

  const main = (participants || []).filter((p) => ['registered', 'checked_in', 'no_show'].includes(p.status));
  // Members already on this kèo (any list but cancelled): not offered again in "Import from club".
  const onEvent = new Set((participants || []).filter((p) => p.status !== 'cancelled').flatMap((p) => [p.source_club_member_id, p.guest_member_id, p.card?.member_id]).filter(Boolean));
  const pending = (participants || []).filter((p) => p.status === 'pending');
  // Guests with a perk go first off the waitlist, so show them first.
  const waitlist = (participants || []).filter((p) => p.status === 'waitlisted').sort((a, b) => Number(!!b.priority) - Number(!!a.priority) || String(a.joined_at).localeCompare(String(b.joined_at)));
  const cancelled = (participants || []).filter((p) => p.status === 'cancelled');
  const requested = (participants || []).filter((p) => p.status === 'requested');
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

  // Meetings / get-togethers have their own page: details + votes, who comes, cash box.
  if (event.kind === 'meeting' && event.club_id) {
    return (
      <AppShell>
        <MeetingEvent event={event} onChanged={setEvent} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {justSaved && <p className="card !py-3 mb-4 border-lime-400/60 bg-lime-400/10 text-lime-200 font-semibold" role="status">✓ {t('common.savedLong')}</p>}
      <div className="mb-4">
        <h1 className="text-white text-2xl font-bold leading-tight">{event.title}</h1>
        <p className="text-gray-300 text-base mt-1">
          📅 {formatDay(event.event_date, lang, { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })}
          {event.start_time && ` · ${hhmm(event.start_time)}${event.end_time ? `–${hhmm(event.end_time)}` : ''}`}
        </p>
        {(event.location || event.map_url || event.club_map_url) && <div className="mt-0.5"><MapLink location={event.location} mapUrl={event.map_url || event.club_map_url} /></div>}
        {(event.play_format || event.services || event.series_id) && (
          <p className="text-gray-400 text-sm mt-0.5">
            {[event.series_id && `🔁 ${t('series.badge')}`, event.play_format && `🏓 ${t(`fmt.${event.play_format}`)}`, event.services && `🎁 ${event.services}`].filter(Boolean).join(' · ')}
          </p>
        )}
        {/* The three things a Host does all the time, as big buttons. */}
        {event.kind !== 'meeting' && (
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" className="btn-primary" onClick={copyLink} disabled={!event.allow_public_registration}>
              <span aria-hidden>📤</span> {linkCopied ? t('events.copied') : t('ux.sendLink')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowQr(true)}>
              <span aria-hidden>📷</span> {t('ux.checkin')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => { setTab('participants'); setShowImport(true); }}>
              <span aria-hidden>➕</span> {t('ux.addPlayer')}
            </button>
          </div>
        )}
      </div>
      <Modal open={showQr} title={t('qr.scanTitle')} onClose={() => setShowQr(false)}>
        {showQr && <QrCheckinPanel endpoint={`/api/events/${eventId}/checkin-code`} onCheckedIn={refresh} />}
      </Modal>

      <div role="tablist" className="grid grid-cols-4 gap-1 bg-navy-900 border border-navy-700 rounded-xl p-1 mb-4">
        {['participants', 'finance', 'matches', 'details'].map((tb) => (
          <button
            key={tb}
            role="tab"
            aria-selected={tab === tb}
            aria-label={tb === 'details' ? t('ux.tabSettings') : undefined}
            onClick={() => setTab(tb)}
            className={`px-2 py-2 rounded-lg text-sm truncate ${tab === tb ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-300 hover:bg-navy-800'}`}
          >
            {tb === 'details' ? <>⚙️<span className="hidden sm:inline"> {t('ux.tabSettings')}</span></> : tb === 'participants' ? `👥 ${main.length}` : tb === 'matches' ? `🏓 ${(matches || []).length}` : `💰 ${t('ux.tabMoney')}`}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <>
          <EventControls event={event} onChanged={(e) => setEvent({ ...event, ...e })} />
          {event.kind !== 'meeting' && <EventShareCard event={event} onSaved={(e) => setEvent({ ...event, ...e })} />}
          {event.kind !== 'meeting' && <QuickInviteCard event={event} />}
          <div className="card !py-3 mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-gray-300 text-sm">{event.kind !== 'meeting' ? `⏰ ${policyText(t, event.cancel_deadline_hours, event.cancel_half_hours, event.no_refund)}` : ''}</span>
            <button className="btn-secondary text-sm" onClick={onExport}>⬇ {t('common.exportExcel')}</button>
          </div>
        </>
      )}

      {tab === 'participants' && (
        <>
          <Modal open={showImport} title={t('ux.addPlayer')} onClose={() => setShowImport(false)}>
            <p className="text-white font-semibold mb-2">✍️ {t('ux.addByHand')}</p>
            <form onSubmit={addParticipant} className="flex flex-col gap-2">
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
            {(clubMembers || []).length > 0 && (
              <div className="mt-5 pt-4 border-t border-navy-700">
            <div>
              {(() => {
                const pickable = (clubMembers || []).filter((m) => m.is_active && !onEvent.has(m.id));
                const all = pickable.length > 0 && pickable.every((m) => selectedIds.includes(m.id));
                return (
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-gray-400 text-sm">{t('events.importFromClub')}</p>
                    {pickable.length > 0 && (
                      <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setSelectedIds(all ? [] : pickable.map((m) => m.id))}>
                        {all ? `☐ ${t('events.selectNone')}` : `☑ ${t('events.selectAll', { n: pickable.length })}`}
                      </button>
                    )}
                  </div>
                );
              })()}
              <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
                {(clubMembers || []).filter((m) => m.is_active && !onEvent.has(m.id)).map((m) => (
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
              </div>
            )}
          </Modal>
          {/* Communities: every sign-up is checked by the Host (setting: auto-confirm by DUPR). */}
          {ownerKind === 'community' ? (
            <div className="card !py-3 mb-4 text-sm flex items-center gap-2">
              <p className="text-gray-200 flex-1">✅ {t('people.commCheckTitle')}</p>
              <Hint inline text={t('people.commCheckHint')} />
              <a href="/club/community-settings" className="text-lime-400 text-sm underline shrink-0">⚙️</a>
            </div>
          ) : (
            <AutoApproveToggle event={event} onChanged={(e) => setEvent({ ...event, ...e })} />
          )}
          <RequestsSection rows={requested} onPlace={placeTo} onOpen={(p) => openSheet(p)} />
          {flash && (
            <div className="card mb-4 border-lime-400/50 text-lime-300 text-sm flex items-center justify-between gap-3">
              <span>{flash}</span>
              <button className="text-gray-400 text-lg leading-none" aria-label="Close" onClick={() => setFlash('')}>×</button>
            </div>
          )}
          {/* The numbers of the kèo as one compact strip (wraps on a phone). */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {[
              ['arrived', `${counts.arrived}/${counts.confirmed}`, 'text-lime-400'],
              ['confirmed', `${counts.confirmed + pending.length}/${event.slots}`, 'text-white'],
              ['toReview', counts.toReview, counts.toReview ? 'text-sky-300' : 'text-gray-500'],
              ['toPay', counts.toPay, counts.toPay ? 'text-yellow-300' : 'text-gray-500'],
              ['waitlist', waitlist.length, 'text-gray-300'],
            ].map(([k, v, tone]) => (
              <div key={k} className="inline-flex items-baseline gap-1.5 rounded-lg border border-navy-700 bg-navy-800 px-2.5 py-1.5">
                <span className={`font-bold tabular-nums ${tone}`}>{v}</span>
                <span className="text-gray-400 text-xs">{t(`court.${k}`)}</span>
              </div>
            ))}
          </div>
          {event.club_id && sport === 'badminton' && <EventShuttles event={event} />}
          <HostTicketPasses event={event} onChanged={refresh} />
          <PaymentReview event={event} rows={pending} onChanged={() => { refresh(); reloadFinance(); }} />
          <ParticipantTable kind="main" title={`${t('events.mainList')} · ${counts.confirmed}/${event.slots}${pending.length ? ` (+${pending.length} ${t('court.holding')})` : ''}`} rows={main} t={t} sport={sport} fee={event.fee_amount} onManage={openSheet} onAction={doAction} />
          <ParticipantTable kind="waitlist" title={`${t('events.waitlist')} (${waitlist.length})`} rows={waitlist} t={t} sport={sport} fee={event.fee_amount} onManage={openSheet} onAction={doAction} />
          <OrganizersSection event={event} people={participants || []} onOpen={openSheet} />
          {cancelled.length > 0 && (
            <ParticipantTable kind="cancelled" title={`${t('policy.cancelledList')} (${cancelled.length})`} rows={cancelled} t={t} sport={sport} fee={event.fee_amount} onManage={openSheet} onAction={doAction} />
          )}
          {event.club_id && <EventSurveys eventId={event.id} />}
          {cancelP && (
            <CancelDialog
              open
              host
              name={cancelP.full_name}
              percent={refundIfCancelNow({ ...deadlinesOf(eventStartMs(event.event_date, event.start_time), event.cancel_deadline_hours, event.cancel_half_hours, event.no_refund), status: cancelP.status })}
              fee={Number(cancelP.fee_amount ?? event.fee_amount ?? 0)}
              paid={!!cancelP.fee_paid}
              usesSession={cancelP.paid_by_plan}
              busy={cancelBusy}
              onClose={() => setCancelP(null)}
              onConfirm={confirmCancel}
            />
          )}
          {sheet && (
            <PlaceSheet
              event={event}
              person={sheet.person ? (participants || []).find((x) => x.id === sheet.person.id) || sheet.person : null}
              isHost={sheet.isHost}
              onClose={() => setSheet(null)}
              onChanged={refresh}
              actions={{ onAction: doAction, onFee: toggleFee, onRefund: refund, onCancel: askCancel }}
            />
          )}
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
          {event.club_id && sport === 'pickleball' && <DuprExport clubId={event.club_id} scope={{ event: eventId }} fileName={`dupr-${event.event_date}`} reloadKey={JSON.stringify((matches || []).map((m) => [m.id, m.team1_score, m.team2_score]))} />}
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

      {tab === 'finance' && <EventFinance event={event} finance={finance} onChanged={reloadFinance} />}
    </AppShell>
  );
}

const STATUS_PILL = {
  checked_in: 'border-lime-400/60 bg-lime-400/15 text-lime-200',
  registered: 'border-navy-500 text-gray-200',
  no_show: 'border-yellow-400/60 bg-yellow-400/10 text-yellow-200',
  waitlisted: 'border-sky-400/60 bg-sky-400/10 text-sky-200',
  pending: 'border-amber-300/60 bg-amber-300/10 text-amber-100',
  cancelled: 'border-navy-600 text-gray-500',
};
const BADGE = 'text-[10px] leading-4 rounded border px-1 whitespace-nowrap';

// Part of the fee that goes back to a cancelled player (refund tiers; old rows: late = 0%).
const shareOf = (p) => (p.refund_percent != null ? p.refund_percent : p.late_cancel ? 0 : 100);

// One list (main / waitlist / cancelled) as rows: photo, name + tags, level / gender / DUPR,
// where they stand and the money. A tap opens the person's sheet with every action;
// the main list keeps a one-tap check-in for the court.
function ParticipantTable({ kind, title, rows, t, sport, fee, onManage, onAction }) {
  return (
    <section className="card mb-4 !px-2 sm:!px-4">
      <h3 className="text-white font-semibold mb-1 px-2 sm:px-0">{title}</h3>
      {kind === 'cancelled' && <Hint text={t('policy.cancelledHint')} className="mb-2" />}
      {rows.length === 0 && <p className="text-gray-400 text-sm px-2 sm:px-0">—</p>}
      <ul className="divide-y divide-navy-700/70">
        {rows.map((p, idx) => {
          const c = p.card || {};
          const level = levelText(c.level ?? p.dupr_level, sport, t);
          const money = p.is_organizer && p.fee_amount != null && Number(p.fee_amount) === 0
            ? [t('people.noFee'), 'border-navy-600 text-gray-400']
            : p.paid_by_plan && kind !== 'cancelled'
              ? [c.vip ? t(`events.usesPass_${c.vip_period || 'any'}`) : t('events.paidByPlan'), 'border-lime-400/40 text-lime-300']
              : p.fee_paid
                ? [t('common.paid'), 'border-lime-400/60 text-lime-300']
                : kind !== 'cancelled' || p.late_cancel
                  ? [`${t('common.unpaid')}${kind === 'cancelled' && Number(p.fee_amount ?? fee) > 0 ? ` · ${formatVnd(p.fee_amount ?? fee)}` : ''}`, 'border-yellow-400/50 text-yellow-200']
                  : null;
          return (
            <li key={p.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onManage(p)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onManage(p))}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-2 cursor-pointer hover:bg-navy-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 ${kind === 'cancelled' ? 'opacity-70' : ''}`}
              >
                <span className="relative shrink-0">
                  <Avatar src={c.avatar} name={p.full_name} size={36} />
                  {p.is_organizer && <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-sky-500 px-1 text-[10px] leading-4" aria-hidden>🛡</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-white font-semibold break-words min-w-0">{p.full_name}</span>
                    {c.member_type === 'fixed' && <span className={`${BADGE} border-lime-400/50 text-lime-300`}>{t('events.fixedMember')}</span>}
                    {!p.is_organizer && c.member_type !== 'fixed' && (p.source_club_member_id || p.user_id || c.member_type) && <span className={`${BADGE} border-navy-500 text-gray-300`}>{t('review.kind_guest')}</span>}
                    {p.is_organizer && <span className={`${BADGE} border-sky-400/60 text-sky-300`}>🛡 {t('people.organizer')}</span>}
                    {(p.tags || []).map((tag) => <span key={tag} className={`${BADGE} border-navy-500 text-gray-300`}>{t(`people.tag_${tag}`)}</span>)}
                    {p.priority && <span className={`${BADGE} border-sky-400/60 text-sky-300`} title={t('guests.priorityMeans')}>⚡ {t('guests.perk_priority')}</span>}
                    {p.late_cancel && <span className={`${BADGE} border-orange-400/60 text-orange-300`}>{shareOf(p) === 50 ? t('cancelx.badgeHalf') : t('policy.lateBadge')}</span>}
                    {p.email_unverified && <span className={`${BADGE} border-amber-300/60 text-amber-200`} title={t('everify.hostTagHint')}>📬 {t('everify.hostTag')}</span>}
                    {p.booking && <span className={`${BADGE} border-amber-300/60 text-amber-200`} title={t('quick.badgeHint', { name: p.booking.contact_name, phone: p.booking.contact_phone })}>⚡ {t('quick.badge')}</span>}
                    {kind === 'cancelled' && p.fee_paid && shareOf(p) > 0 && (p.refunded_at
                      ? <span className={`${BADGE} border-lime-400/60 text-lime-300`} title={p.refunded_by || ''}>✓ {t('slot.refunded', { amount: formatVnd(p.refund_amount || 0), date: localDate(new Date(p.refunded_at), 'vi-VN') })}</span>
                      : <span className={`${BADGE} border-sky-400/60 text-sky-300`}>{t('slot.refundDue')}</span>)}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2.5 text-xs text-gray-400 mt-0.5">
                    {/* Three different numbers, each with its own name: Điểm trình (the Host's
                        score + level), DUPR ✓ (from DUPR), DUPR tự nhập (the player's own). */}
                    {(c.skill_score != null || c.level_label) && (
                      <span className="text-gray-200">🎯 {c.skill_score != null ? `${t('members.colSkill')} ${c.skill_score.toFixed(2)}` : ''}{c.level_label ? `${c.skill_score != null ? ' · ' : ''}${c.level_label}` : ''}</span>
                    )}
                    {sport !== 'pickleball' && <span>{level || '—'}</span>}
                    {(c.gender || p.gender) && <span>{(c.gender || p.gender) === 'male' ? '♂' : '♀'} {t(`members.${c.gender || p.gender}`)}</span>}
                    {p.booking && <span>📞 {p.booking.contact_name} · {p.booking.contact_phone}</span>}
                    {sport === 'pickleball' && c.dupr_verified != null ? (
                      <span className="rounded bg-sky-600/80 px-1 text-[10px] font-bold text-white" title={t('dupr.updatedOn', { date: localDate(new Date(c.dupr_updated_at), 'vi-VN') })}>
                        DUPR ✓ {Number(c.dupr_verified).toFixed(2)} <span className="font-normal opacity-80">· {t('dupr.updatedOn', { date: localDate(new Date(c.dupr_updated_at), 'vi-VN') })}</span>
                      </span>
                    ) : null}
                    {sport === 'pickleball' && (c.dupr ?? c.level ?? p.dupr_level) != null && <span>{t('members.colDuprSelf')} {Number(c.dupr ?? c.level ?? p.dupr_level).toFixed(2)}</span>}
                    {sport === 'pickleball' && c.dupr_verified == null && c.dupr_id && <span className="text-[10px] text-gray-500">ID {c.dupr_id}</span>}
                  </span>
                  {/* Phones: status chips and the check-in button on one line under the name. */}
                  <span className="flex sm:hidden flex-wrap items-center gap-1 mt-1">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap ${STATUS_PILL[p.status] || STATUS_PILL.registered}`}>{t(`player.status_${p.status}`)}</span>
                  {money && <span className={`rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap ${money[1]}`}>{money[0]}</span>}
                  {kind === 'main' && (
                    <span className="ml-auto">
                      <button
                        type="button"
                        title={p.status === 'checked_in' ? t('staffView.undo') : t('events.checkIn')}
                        aria-label={`${p.status === 'checked_in' ? t('staffView.undo') : t('events.checkIn')}: ${p.full_name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(p, p.status === 'checked_in' ? 'reset' : 'check-in');
                        }}
                        className={`inline-flex items-center h-8 shrink-0 rounded-full border-2 px-3 text-sm font-semibold whitespace-nowrap ${p.status === 'checked_in' ? 'border-lime-400 bg-lime-400 text-navy-950' : 'border-navy-500 text-gray-200 hover:border-lime-400 hover:text-lime-300'}`}
                      >
                        {p.status === 'checked_in' ? `✓ ${t('ux.arrived')}` : t('ux.markArrived')}
                      </button>
                    </span>
                  )}
                  </span>
                  {kind === 'waitlist' && <span className="block text-sky-300 text-[11px] mt-0.5">{t('events.waitOrder', { n: idx + 1, at: localDate(p.joined_at, 'vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) })}</span>}
                  {kind !== 'cancelled' && p.cancel_history && <span className="block mt-1" onClick={(e) => e.stopPropagation()}><CancelHistoryBadge name={p.full_name} history={p.cancel_history} /></span>}
                  {p.transferred_from && <span className="block text-gray-500 text-[11px] mt-0.5">{t('slot.from', { name: p.transferred_from })}</span>}
                  {kind === 'cancelled' && (p.cancelled_at || p.cancel_reason) && (
                    <span className="block text-gray-400 text-[11px] mt-0.5">
                      {p.cancelled_at && `${t('cancelx.cancelledAt', { at: localDate(new Date(p.cancelled_at), 'vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }, true) })} · `}
                      <CancelLine item={{ refund_percent: p.refund_percent, by: p.cancelled_by, reason: p.cancel_reason }} fee={Number(p.fee_amount ?? fee ?? 0)} paid={!!p.fee_paid} />
                    </span>
                  )}
                </span>
                {/* Bigger screens: status on the right. Phones: under the name (the name is never cut). */}
                <span className="hidden sm:flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap ${STATUS_PILL[p.status] || STATUS_PILL.registered}`}>{t(`player.status_${p.status}`)}</span>
                  {money && <span className={`rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap ${money[1]}`}>{money[0]}</span>}
                </span>
                {kind === 'main' && (
                  <button
                    type="button"
                    title={p.status === 'checked_in' ? t('staffView.undo') : t('events.checkIn')}
                    aria-label={`${p.status === 'checked_in' ? t('staffView.undo') : t('events.checkIn')}: ${p.full_name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction(p, p.status === 'checked_in' ? 'reset' : 'check-in');
                    }}
                    className={`hidden sm:inline-flex items-center h-10 shrink-0 rounded-full border-2 px-2.5 text-sm font-semibold whitespace-nowrap ${p.status === 'checked_in' ? 'border-lime-400 bg-lime-400 text-navy-950' : 'border-navy-500 text-gray-200 hover:border-lime-400 hover:text-lime-300'}`}
                  >
                    {p.status === 'checked_in' ? `✓ ${t('ux.arrived')}` : t('ux.markArrived')}
                  </button>
                )}
                <span className="text-gray-500 shrink-0" aria-hidden>›</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
