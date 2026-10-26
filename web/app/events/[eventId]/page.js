'use client';
import DuprExport from '@/components/DuprExport';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import EventStandings from '@/components/EventStandings';
import UiIcon from '@/components/ui/UiIcon';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import EventShareCard from '@/components/EventShareCard';
import Modal from '@/components/Modal';
import MatchForm from '@/components/MatchForm';
import MatchList, { isScored } from '@/components/MatchList';
import QrCheckinPanel from '@/components/QrCheckinPanel';
import CourtsPlanner from '@/components/CourtsPlanner';
import CourtBoards, { DuprBadge, moneyOf } from '@/components/CourtBoards';
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
import { exportEventFinance, exportEventPlayers } from '@/lib/exportExcel';
import { planFor, hasFeature, lockedNotice } from '@/lib/planFeatures';
import { CancelDialog, CancelHistoryBadge, CancelLine } from '@/components/CancelHistory';
import { deadlinesOf, eventStartMs, policyText, refundIfCancelNow } from '@/lib/cancelPolicy';
import Hint from '@/components/ui/Hint';

// "Thêm thành viên": họ tên, giới tính, DUPR ID và DUPR tự nhập (2 ô cuối không bắt buộc).
const EMPTY_MEMBER = { full_name: '', gender: '', dupr_id: '' };

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
  // Import only from the club / community the event belongs to (never the selected one).
  const importClubId = event?.club_id || null;
  const { data: clubMembers } = useLoad(
    () => (importClubId ? api.get(`/api/clubs/${importClubId}/members`) : Promise.resolve([])),
    [importClubId]
  );

  const [form, setForm] = useState(EMPTY_MEMBER);
  const [formError, setFormError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  // Kèo with 2+ time groups: which group the people added by hand go into.
  const [addGroup, setAddGroup] = useState(null);
  const [flash, setFlash] = useState('');
  const [showMatch, setShowMatch] = useState(false); // false | true | { slots, extra } (challenge)
  const [showDupr, setShowDupr] = useState(false); // "Xuất file DUPR": the CSV in DUPR's import template
  const [matchTab, setMatchTab] = useState('enter'); // Nhập điểm / Kết quả / Bảng xếp hạng
  // The place sheet on a name: { person (row or null for the Host without one), isHost }.
  const [sheet, setSheet] = useState(null);
  const { data: matches, reload: reloadMatches } = useLoad(() => api.get(`/api/matches?event_id=${eventId}`), [eventId]);

  async function addParticipant(e) {
    e.preventDefault();
    setFormError('');
    try {
      await api.post(`/api/events/${eventId}/participants`, { ...form, full_name: form.full_name.trim(), as_member: true, ...(pickGroup ? { group_id: pickGroup } : {}) });
    } catch (err) {
      setFormError(err.message);
      return;
    }
    setForm(EMPTY_MEMBER);
    setShowImport(false);
    reloadParticipants();
    reloadEvent();
  }

  // "Gửi link": copy the sign-up link in one tap (to paste into Zalo / Messenger).
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
      const r = await api.post(`/api/events/${eventId}/participants/${p.id}/place`, { to });
      if (r?.group_count > 1) setFlash(t('people.groupApproved', { n: r.group_count }));
    } catch (err) {
      setFlash(err.payload?.code === 'full' ? t('place.full') : err.message);
    }
    reloadParticipants();
    reloadEvent();
  }
  // Decline a quick booking's request (the whole group): the player sees it on their page.
  async function declineGroup(p, n) {
    if (!window.confirm(t('people.declineAsk', { name: p.booking?.contact_name || p.full_name, n }))) return;
    try {
      await api.post(`/api/events/${eventId}/participants/${p.id}/cancel`, { reason: t('people.declineReason') });
      setFlash(t('people.declined', { name: p.booking?.contact_name || p.full_name }));
    } catch (err) {
      setFlash(err.message);
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
      await api.post(`/api/events/${eventId}/participants/import`, { club_member_ids: selectedIds, ...(pickGroup ? { group_id: pickGroup } : {}) });
    } catch (err) {
      setFlash(err.payload?.code === 'already_on_event' ? t('events.alreadyOnEvent') : err.message);
    }
    setSelectedIds([]);
    setShowImport(false);
    reloadParticipants();
    reloadEvent();
  }

  function onExportPlayers() {
    if (!event || !participants) return;
    if (event.club_id && !hasFeature(planFor(club, plan), 'excel_export')) return lockedNotice('excel_export');
    exportEventPlayers(event, participants, t, (p) => levelText(p.card?.level ?? p.dupr_level, sport, t) || (p.card?.dupr != null ? `DUPR ${Number(p.card.dupr).toFixed(2)}` : ''));
  }

  function onExport() {
    if (!event || !participants || !finance) return;
    if (event.club_id && !hasFeature(planFor(club, plan), 'excel_export')) return lockedNotice('excel_export');
    exportEventFinance(event, participants, finance.transactions || [], t);
  }

  if (!event) return <AppShell><p className="text-gray-400">{t('common.loading')}</p></AppShell>;

  const main = (participants || []).filter((p) => ['registered', 'checked_in', 'no_show'].includes(p.status));
  // Time groups to add into ("Sân 3 · 17:00–20:00 · còn 2/8 chỗ"); default: the first with room.
  const groupChoices = (event?.groups || []).map((g, i) => {
    const taken = (participants || []).filter((p) => p.group_id === g.id && ['registered', 'checked_in', 'no_show', 'pending'].includes(p.status)).length;
    return { id: g.id, slots: g.slots, left: Math.max((g.slots || 0) - taken, 0), title: `${t('egroups.courtN', { n: g.courts || i + 1 })}${g.play_format ? ` · ${t(`fmt.${g.play_format}`)}` : ''} · ${g.start_time}–${g.end_time}` };
  });
  const pickGroup = groupChoices.length >= 2 ? (groupChoices.some((g) => g.id === addGroup) ? addGroup : (groupChoices.find((g) => g.left > 0) || groupChoices[0]).id) : null;
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
          {formatDay(event.event_date, lang, { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })}
          {event.start_time && ` · ${hhmm(event.start_time)}${event.end_time ? `–${hhmm(event.end_time)}` : ''}`}
          {event.court_labels && !(event.groups?.length > 1) && ` · ${t('egroups.courtsShort', { list: event.court_labels })}`}
        </p>
        {/* Kèo with time groups: each group's hours, fee per slot, places and courts. */}
        {event.groups?.length > 1 && (
          <p className="text-gray-300 text-sm mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {event.groups.map((g, gi) => (
              <span key={g.id} className="tabular-nums">{t('egroups.courtN', { n: g.courts || gi + 1 })}{g.play_format ? ` (${t(`fmt.${g.play_format}`)})` : ''} · {g.start_time}–{g.end_time} · {Number(g.fee_amount) ? formatVnd(g.fee_amount) : t('public.free')} · {t('createx.slotsN', { n: g.slots })}</span>
            ))}
          </p>
        )}
        {(event.location || event.map_url || event.club_map_url) && <div className="mt-0.5"><MapLink location={event.location} mapUrl={event.map_url || event.club_map_url} /></div>}
        {event.members_only && (
          <p className="text-gray-300 text-sm mt-0.5">
            {event.public_from && Date.parse(event.public_from) > Date.now() ? t('mfirst.badgeUntil', { at: new Date(event.public_from).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) }) : event.public_from ? t('mfirst.nowPublic') : t('mfirst.badge')}
          </p>
        )}
        {(event.play_format || event.services || event.series_id) && (
          <p className="text-gray-400 text-sm mt-0.5">
            {[event.series_id && `${t('series.badge')}`, event.play_format && `${t(`fmt.${event.play_format}`)}`, event.services && `${event.services}`].filter(Boolean).join(' · ')}
          </p>
        )}
        {/* The three things a Host does all the time, as big buttons; the main one (send the link) on the right. */}
        {event.kind !== 'meeting' && (
          // Phone: three equal buttons in one row (icon above the word); wider screens: on the right.
          <div className="grid grid-cols-3 gap-2 mt-3 sm:flex sm:flex-wrap sm:justify-end">
            <button type="button" className="btn-secondary !px-2 sm:!px-4 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 leading-tight" onClick={() => { setTab('participants'); setShowImport(true); }}>
              <UiIcon name="userPlus" /> <span>{t('ux.addPlayer')}</span>
            </button>
            <button type="button" className="btn-secondary !px-2 sm:!px-4 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 leading-tight" onClick={() => setShowQr(true)}>
              <UiIcon name="scan" /> <span>{t('ux.checkin')}</span>
            </button>
            <button type="button" className="btn-primary !px-2 sm:!px-4 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 leading-tight" onClick={copyLink} disabled={!event.allow_public_registration}>
              <UiIcon name="send" /> <span>{linkCopied ? t('events.copied') : t('ux.sendLink')}</span>
            </button>
          </div>
        )}
      </div>
      <Modal open={showQr} title={t('qr.scanTitle')} onClose={() => setShowQr(false)}>
        {showQr && <QrCheckinPanel endpoint={`/api/events/${eventId}/checkin-code`} onCheckedIn={refresh} />}
      </Modal>

      {/* Sign-ups waiting for the Host: on top of every tab, impossible to miss. */}
      {event.kind !== 'meeting' && <RequestsSection rows={requested} community={ownerKind === 'community'} onPlace={placeTo} onOpen={(p) => openSheet(p)} onDecline={declineGroup} />}

      <div role="tablist" className="grid grid-cols-4 gap-1 bg-navy-900 border border-navy-700 rounded-xl p-1 mb-4">
        {['participants', 'finance', 'matches', 'details'].map((tb) => (
          <button
            key={tb}
            role="tab"
            aria-selected={tab === tb}
            onClick={() => setTab(tb)}
            className={`relative flex min-h-[2.75rem] flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg text-xs sm:min-h-0 sm:flex-row sm:gap-1.5 sm:text-sm leading-tight transition-colors ${tab === tb ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-300 hover:bg-navy-800 active:bg-navy-700'}`}
          >
            {/* Every tab says what it is (icon + word), counts in brackets. */}
            <UiIcon name={{ participants: 'users', finance: 'wallet', matches: 'paddle', details: 'settings' }[tb]} className="w-5 h-5 sm:w-4 sm:h-4" />
            <span>
              {{ participants: t('ux.tabPlayers'), finance: t('ux.tabMoney'), matches: t('ux.tabMatches'), details: t('ux.tabSettings') }[tb]}
              {tb === 'participants' && ` (${main.length})`}
              {tb === 'matches' && ` (${(matches || []).length})`}
            </span>
            {tb === 'participants' && requested.length > 0 && <span className="absolute -top-1 -right-1 min-w-[1.25rem] rounded-full bg-amber-400 px-1 text-[11px] font-bold text-navy-950">{requested.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <>
          <EventControls event={event} onChanged={(e) => setEvent({ ...event, ...e })} />
          {event.kind !== 'meeting' && <EventShareCard event={event} onSaved={(e) => setEvent({ ...event, ...e })} />}
          <div className="card !py-3 mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-gray-300 text-sm">{event.kind !== 'meeting' ? `${policyText(t, event.cancel_deadline_hours, event.cancel_half_hours, event.no_refund)}` : ''}</span>
            <button className="btn-secondary text-sm" onClick={onExport}>{t('common.exportExcel')}</button>
          </div>
        </>
      )}

      {tab === 'participants' && (
        <>
          <Modal open={showImport} title={t('ux.addPlayer')} onClose={() => setShowImport(false)}>
            {groupChoices.length >= 2 && (
              <fieldset className="mb-4">
                <legend className="text-white font-semibold mb-1">{t('ux.pickSlot')}</legend>
                <p className="text-gray-400 text-xs mb-2">{t('ux.pickSlotHint')}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('ux.pickSlot')}>
                  {groupChoices.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      role="radio"
                      aria-checked={pickGroup === g.id}
                      onClick={() => setAddGroup(g.id)}
                      className={`min-h-[2.75rem] rounded-lg border px-3 py-2 text-left text-sm transition-colors ${pickGroup === g.id ? 'border-lime-400 bg-lime-400/15' : 'border-navy-600 hover:border-navy-500'}`}
                    >
                      <span className={`block font-semibold tabular-nums ${pickGroup === g.id ? 'text-lime-200' : 'text-white'}`}>{g.title}</span>
                      <span className={`block text-xs tabular-nums ${g.left > 0 ? 'text-gray-400' : 'text-amber-300'}`}>
                        {g.left > 0 ? t('egroups.left', { n: Math.max(g.slots - g.left, 0), total: g.slots }) : t('egroups.full')}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <p className="text-white font-semibold mb-1">{t('ux.addByHand')}</p>
            <p className="text-gray-400 text-xs mb-3">{t('ux.addMemberHint')}</p>
            <form onSubmit={addParticipant} className="flex flex-col gap-3">
              <div>
                <label className="text-sm text-gray-300" htmlFor="am-name">{t('ux.fullName')}</label>
                <input id="am-name" className="input" required maxLength={120} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div>
                <span className="text-sm text-gray-300">{t('members.gender')}</span>
                <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('members.gender')}>
                  {['male', 'female'].map((g) => (
                    <button
                      key={g}
                      type="button"
                      role="radio"
                      aria-checked={form.gender === g}
                      onClick={() => setForm({ ...form, gender: g })}
                      className={`min-h-[2.75rem] rounded-lg border px-3 text-sm font-semibold transition-colors ${form.gender === g ? 'border-lime-400 bg-lime-400/15 text-lime-200' : 'border-navy-600 text-gray-200 hover:border-navy-500'}`}
                    >
                      {t(`members.${g}`)}
                    </button>
                  ))}
                </div>
              </div>
              {sport === 'pickleball' && (
                <div>
                  <div>
                    <label className="text-sm text-gray-300" htmlFor="am-dupr-id">{t('quick.duprId')} <span className="text-gray-500 text-xs">({t('ux.optional')})</span></label>
                    <input id="am-dupr-id" className="input uppercase" maxLength={10} autoCapitalize="characters" value={form.dupr_id} onChange={(e) => setForm({ ...form, dupr_id: e.target.value.toUpperCase() })} />
                  </div>
                </div>
              )}
              {formError && <p className="text-red-300 text-sm" role="alert">{formError}</p>}
              <div className="flex justify-end">
                <button className="btn-primary" disabled={!form.full_name.trim() || !form.gender}>{t('ux.addMemberBtn')}</button>
              </div>
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
                      <label className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={all}
                          ref={(el) => { if (el) el.indeterminate = !all && selectedIds.length > 0; }}
                          onChange={() => setSelectedIds(all ? [] : pickable.map((m) => m.id))}
                        />
                        {all ? t('events.selectNone') : t('events.selectAll', { n: pickable.length })}
                      </label>
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
          {/* Communities: every sign-up is checked by the Host (explained in the requests box). */}
          {ownerKind !== 'community' && <AutoApproveToggle event={event} onChanged={(e) => setEvent({ ...event, ...e })} />}
          {flash && (
            <div className="card mb-4 border-lime-400/50 text-lime-300 text-sm flex items-center justify-between gap-3">
              <span>{flash}</span>
              <button className="text-gray-400 text-lg leading-none" aria-label="Close" onClick={() => setFlash('')}>×</button>
            </div>
          )}
          {/* Xuất danh sách người chơi (Excel): sân, tên, giới tính, trình độ, SĐT, trạng thái, tiền. */}
          <div className="flex justify-end mb-2">
            <button type="button" className="btn-secondary text-sm inline-flex items-center gap-1.5 min-h-[2.75rem]" disabled={!(participants || []).length} onClick={onExportPlayers}>
              <UiIcon name="download" className="w-4 h-4" /> {t('people.exportList')}
            </button>
          </div>
          {/* The numbers of the kèo: four equal tiles, the word first, then the number. One
              "Chờ thanh toán" for everyone still paying (sent a screenshot or not). */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {[
              ['placed', `${counts.confirmed + pending.length}/${event.slots}`, 'text-white', null],
              ['payWaiting', pending.length, pending.length ? 'text-yellow-300' : 'text-gray-500', counts.toReview ? t('court.proofN', { n: counts.toReview }) : null],
              ['waitlist', waitlist.length, waitlist.length ? 'text-sky-300' : 'text-gray-500', null],
              ['arrived', `${counts.arrived}/${counts.confirmed}`, 'text-lime-400', null],
            ].map(([k, v, tone, sub]) => (
              <div key={k} className="rounded-xl border border-navy-700 bg-navy-800 px-3 py-2">
                <p className="text-gray-400 text-xs">{t(`court.${k}`)}</p>
                <p className={`text-lg font-bold tabular-nums leading-tight ${tone}`}>{v}</p>
                {sub && <p className="text-sky-300 text-[11px]">{sub}</p>}
              </div>
            ))}
          </div>
          {event.club_id && sport === 'badminton' && <EventShuttles event={event} />}
          <HostTicketPasses event={event} onChanged={refresh} />
          <PaymentReview event={event} rows={pending} onChanged={() => { refresh(); reloadFinance(); }} />
          {/* Several courts: one board per court with the players who signed up for it. */}
          {event.groups?.length > 1 ? (
            <CourtBoards event={event} rows={main} sport={sport} money onManage={openSheet} onAction={doAction} />
          ) : (
            <ParticipantTable kind="main" title={`${t('events.mainList')} · ${counts.confirmed}/${event.slots}${pending.length ? ` (+${pending.length} ${t('court.holding')})` : ''}`} rows={main} t={t} sport={sport} fee={event.fee_amount} hostName={event.host_name} groups={event.groups} onManage={openSheet} onAction={doAction} />
          )}
          <ParticipantTable kind="waitlist" title={`${t('events.waitlist')} (${waitlist.length})`} rows={waitlist} t={t} sport={sport} fee={event.fee_amount} hostName={event.host_name} groups={event.groups} onManage={openSheet} onAction={doAction} />
          <OrganizersSection event={event} people={participants || []} onOpen={openSheet} />
          {cancelled.length > 0 && (
            <ParticipantTable kind="cancelled" title={`${t('policy.cancelledList')} (${cancelled.length})`} rows={cancelled} t={t} sport={sport} fee={event.fee_amount} hostName={event.host_name} groups={event.groups} onManage={openSheet} onAction={doAction} />
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
              {t('matches.exportJpg')}
            </button>
            {event.club_id && sport === 'pickleball' && (
              <button className="btn-secondary text-sm" disabled={!(matches || []).length} onClick={() => setShowDupr(true)}>
                {t('duprx.exportBtn')}
              </button>
            )}
            <button className="btn-primary text-sm" onClick={() => setShowMatch(true)}>+ {t('matches.add')}</button>
          </div>
          <Modal open={showDupr} title={t('duprx.exportBtn')} onClose={() => setShowDupr(false)}>
            {showDupr && <DuprExport bare clubId={event.club_id} scope={{ event: eventId }} fileName={`dupr-${event.event_date || 'keo'}`} reloadKey={JSON.stringify((matches || []).map((m) => [m.id, m.team1_score, m.team2_score]))} />}
          </Modal>
          {/* Nhập điểm: set up matches and score the ones still open. Kết quả: every scored
              match. Bảng xếp hạng: this kèo's standings + the challenge suggestion. */}
          <UnderlineTabs
            value={matchTab}
            onChange={setMatchTab}
            tabs={[
              { key: 'enter', label: t('matches.tabEnter'), icon: 'edit', count: (matches || []).filter((m) => !isScored(m)).length },
              { key: 'results', label: t('matches.tabResults'), icon: 'clipboard', count: (matches || []).filter(isScored).length },
              { key: 'auto', label: t('courts.autoTab'), icon: 'court' },
              { key: 'standings', label: t('estand.title'), icon: 'medal' },
            ]}
          />
          {/* Xếp trận tự động: rounds per court, fair turns (the same board as coordinators). */}
          {matchTab === 'auto' && (
            <CourtsPlanner
              ev={{ ...event, sport, matches: matches || [] }}
              people={(participants || []).map((p) => ({ id: p.id, full_name: p.full_name, status: p.status, dupr_level: p.card?.level ?? p.dupr_level, group_id: p.group_id }))}
              endpoint="/api/matches"
              extraBody={{ event_id: eventId }}
              onSaved={reloadMatches}
            />
          )}
          {matchTab === 'enter' && <MatchList matches={(matches || []).filter((m) => !isScored(m))} emptyText={t('matches.noneOpen')} onChanged={reloadMatches} />}
          {matchTab === 'results' && <MatchList matches={(matches || []).filter(isScored)} onChanged={reloadMatches} />}
          {matchTab === 'standings' && (
            <EventStandings
              matches={matches || []}
              onChallenge={(pick, reward) => setShowMatch({ slots: { 1: pick.team1.map((r) => r.id), 2: pick.team2.map((r) => r.id) }, extra: { is_challenge: true, challenge_reward: reward } })}
            />
          )}
          <Modal open={!!showMatch} title={showMatch?.extra ? `${t('matches.challenge')}` : t('matches.add')} onClose={() => setShowMatch(false)}>
            {showMatch && (
              <MatchForm
                players={main.map((p) => ({ id: p.id, name: p.full_name }))}
                pastMatches={matches || []}
                initialSlots={showMatch?.slots || null}
                extra={showMatch?.extra || {}}
                idField="event_participant_id"
                parent={{ event_id: eventId }}
                onCancel={() => setShowMatch(false)}
                onSaved={() => {
                  setShowMatch(false);
                  setMatchTab('enter');
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
// "DUPR 3.29 · Uy tín 80%" from the verified rating; no rating yet = "DUPR NR".



function ParticipantTable({ kind, title, rows, t, sport, fee, hostName, groups, onManage, onAction }) {
  return (
    <section className="card mb-4 !px-2 sm:!px-4">
      <h3 className="text-white font-semibold mb-1 px-2 sm:px-0">{title}</h3>
      {kind === 'cancelled' && <Hint text={t('policy.cancelledHint')} className="mb-2" />}
      {rows.length === 0 && <p className="text-gray-400 text-sm px-2 sm:px-0">—</p>}
      <ul className="divide-y divide-navy-700/70">
        {rows.map((p, idx) => {
          const c = p.card || {};
          const level = levelText(c.level ?? p.dupr_level, sport, t);
          const money = moneyOf(p, kind, fee, t);
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
                  {p.is_organizer && <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-sky-500 px-1 text-[10px] leading-4" aria-hidden><UiIcon name="shield" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-white font-semibold break-words min-w-0">{p.full_name}</span>
                    {c.member_type === 'fixed' && <span className={`${BADGE} border-lime-400/50 text-lime-300`}>{t('events.fixedMember')}</span>}
                    {!p.is_organizer && c.member_type !== 'fixed' && (p.source_club_member_id || p.user_id || c.member_type) && <span className={`${BADGE} border-navy-500 text-gray-300`}>{t('review.kind_guest')}</span>}
                    {p.is_organizer && <span className={`${BADGE} border-sky-400/60 text-sky-300`}>{t('people.organizer')}</span>}
                    {(p.tags || []).filter((tag) => tag !== 'host_guest').map((tag) => <span key={tag} className={`${BADGE} ${['invited', 'free'].includes(tag) ? 'border-navy-600 text-gray-200' : 'border-navy-500 text-gray-300'}`}>{t(`people.tag_${tag}`)}</span>)}
                    {/* Whose guest: the other slots of a quick booking, or someone the Host added. */}
                    {p.booking && p.full_name !== p.booking.contact_name && <span className={`${BADGE} border-amber-300/60 text-amber-200`}>{t('people.guestOf', { name: p.booking.contact_name })}</span>}
                    {(p.tags || []).includes('host_guest') && <span className={`${BADGE} border-amber-300/60 text-amber-200`}>{t('people.guestOf', { name: hostName || 'Host' })}</span>}
                    {/* Kèo with time groups: the group's hours; the court the Host put them on. */}
                    {groups?.length > 1 && (() => { const g = groups.find((x) => x.id === p.group_id); return g ? <span className={`${BADGE} border-navy-600 text-gray-200 tabular-nums`}>{t('egroups.courtN', { n: g.courts || groups.indexOf(g) + 1 })} · {g.start_time}–{g.end_time}</span> : null; })()}
                    {p.court && <span className={`${BADGE} border-lime-400/60 text-lime-200`}>{t('egroups.courtN', { n: p.court })}</span>}
                    {p.priority && <span className={`${BADGE} border-sky-400/60 text-sky-300`} title={t('guests.priorityMeans')}>{t('guests.perk_priority')}</span>}
                    {p.late_cancel && <span className={`${BADGE} border-orange-400/60 text-orange-300`}>{shareOf(p) === 50 ? t('cancelx.badgeHalf') : t('policy.lateBadge')}</span>}
                    {p.email_unverified && <span className={`${BADGE} border-amber-300/60 text-amber-200`} title={t('everify.hostTagHint')}>{t('everify.hostTag')}</span>}
                    {p.booking && <span className={`${BADGE} border-amber-300/60 text-amber-200`} title={t('quick.badgeHint', { name: p.booking.contact_name, phone: p.booking.contact_phone })}>{t('quick.badge')}</span>}
                    {kind === 'cancelled' && p.fee_paid && shareOf(p) > 0 && (p.refunded_at
                      ? <span className={`${BADGE} border-lime-400/60 text-lime-300`} title={p.refunded_by || ''}>✓ {t('slot.refunded', { amount: formatVnd(p.refund_amount || 0), date: localDate(new Date(p.refunded_at), 'vi-VN') })}</span>
                      : <span className={`${BADGE} border-sky-400/60 text-sky-300`}>{t('slot.refundDue')}</span>)}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2.5 text-xs text-gray-400 mt-0.5">
                    {/* Điểm trình (the Host's score + level), then DUPR + Uy tín. */}
                    {(c.skill_score != null || c.level_label) && (
                      <span className="text-gray-200">{c.skill_score != null ? `${t('members.colSkill')} ${c.skill_score.toFixed(2)}` : ''}{c.level_label ? `${c.skill_score != null ? ' · ' : ''}${c.level_label}` : ''}</span>
                    )}
                    {sport !== 'pickleball' && <span>{level || '—'}</span>}
                    {(c.gender || p.gender) && <span>{t(`members.${c.gender || p.gender}`)}</span>}
                    {p.booking && p.booking.contact_phone && <span>{p.booking.contact_name} · {p.booking.contact_phone}</span>}
                    {/* DUPR (verified only; none yet = "DUPR NR") and its reliability as "Uy tín". */}
                    {sport === 'pickleball' && <DuprBadge c={c} t={t} />}
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
                  {!['cancelled', 'main'].includes(kind) && p.cancel_history && <span className="block mt-1" onClick={(e) => e.stopPropagation()}><CancelHistoryBadge name={p.full_name} history={p.cancel_history} /></span>}
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
