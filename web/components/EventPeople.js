'use client';
import { CancelHistoryBadge } from '@/components/CancelHistory';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { Avatar } from '@/components/PlayerChip';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { levelText } from '@/lib/levels';
import { formatVnd } from '@/lib/format';
import Hint from '@/components/ui/Hint';
import UiIcon from '@/components/ui/UiIcon';

// Where someone stands on the list, as the sheet's buttons name it.
export const PLACE_OF = { requested: 'requested', waitlisted: 'waitlist', not_playing: 'not_playing', registered: 'main', pending: 'main', checked_in: 'main', no_show: 'main' };
const PLACE_TONE = {
  requested: 'border-amber-300 bg-amber-300/15 text-amber-100',
  waitlist: 'border-sky-400 bg-sky-400/15 text-sky-100',
  main: 'border-lime-400 bg-lime-400/20 text-lime-100',
  not_playing: 'border-gray-400 bg-gray-400/10 text-gray-100',
};
const TAGS = ['coach', 'referee'];
const NOTE_TAGS = ['invited', 'free']; // Khách mời, Miễn phí

function Initial({ name, organizer }) {
  return (
    <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-navy-700 text-lg font-bold text-white">
      {(name || '?').trim().charAt(0).toUpperCase()}
      {organizer && <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-sky-500 px-1 text-[10px] leading-4" aria-hidden><UiIcon name="shield" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></span>}
    </span>
  );
}

// "Duyệt tự động": off = the Host checks every sign-up before it gets a place.
export function AutoApproveToggle({ event, onChanged }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  async function flip() {
    setBusy(true);
    try {
      onChanged(await api.patch(`/api/events/${event.id}`, { auto_approve: !event.auto_approve }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card !py-3 mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-white font-semibold text-sm">{t('people.autoApprove')}</p>
        <p className="text-gray-400 text-xs">{event.auto_approve ? t('people.autoOn') : t('people.autoOff')}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!!event.auto_approve}
        aria-label={t('people.autoApprove')}
        disabled={busy}
        onClick={flip}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${event.auto_approve ? 'bg-lime-400' : 'bg-navy-600'}`}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${event.auto_approve ? 'left-[1.4rem]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

// "Người tổ chức": the Host (always) and co-hosts. Tap one to say whether they play.
export function OrganizersSection({ event, people, onOpen }) {
  const { t } = useI18n();
  const hostRow = people.find((p) => p.user_id === event.host_id && p.status !== 'cancelled');
  const others = people.filter((p) => p.is_organizer && p.status !== 'cancelled' && p.user_id !== event.host_id);
  const list = [{ key: 'host', name: hostRow?.full_name || event.host_name || 'Host', row: hostRow || null, host: true }, ...others.map((p) => ({ key: p.id, name: p.full_name, row: p, host: false }))];
  return (
    <section className="card mb-4">
      <h3 className="text-gray-300 text-xs font-semibold mb-1">{t('people.organizers')} · {list.length} <Hint inline text={t('people.organizersHint')} /></h3>
      <div className="flex flex-wrap gap-4">
        {list.map((o) => {
          const place = o.row ? PLACE_OF[o.row.status] : 'not_playing';
          return (
            <button key={o.key} type="button" onClick={() => onOpen(o.row, o.host)} className="flex w-20 flex-col items-center gap-1 text-center">
              <Initial name={o.name} organizer />
              <span className="text-white text-xs leading-tight break-words">{o.name}</span>
              <span className={`rounded-full border px-1.5 text-[10px] ${PLACE_TONE[place]}`}>{t(`place.short_${place}`)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Sign-ups waiting for the Host to check them (level, who they are) before they get a place.
// A loud box (amber, thick frame, count in a badge) so a waiting player is never missed.
// Requests waiting for the Host's info check. A quick booking (invite link) is one group:
// approved or declined together, with who booked it and how to reach them.
export function RequestsSection({ rows, community = false, onPlace, onOpen, onDecline }) {
  const { t } = useI18n();
  if (!rows.length) return null;
  const groups = [];
  const seen = new Map();
  for (const p of rows) {
    const key = p.guest_booking_id || p.id;
    if (!seen.has(key)) {
      seen.set(key, { key, booking: p.guest_booking_id ? p.booking || null : null, people: [] });
      groups.push(seen.get(key));
    }
    seen.get(key).people.push(p);
  }
  const level = (p) => (p.dupr_level != null ? `${t('common.level')} ${Number(p.dupr_level).toFixed(2)}` : t('people.noLevel'));
  return (
    <section className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-400/10 p-3 sm:p-4" role="alert">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-lg font-bold text-navy-950 tabular-nums">{rows.length}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-amber-100 text-base font-bold leading-tight">{t('people.requestsBig', { n: rows.length })}</h3>
        </div>
        <Hint inline text={community ? `${t('people.commCheckTitle')}. ${t('people.commCheckHint')}` : t('people.requestsHint')} />
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {groups.map((g) => {
          const first = g.people[0];
          if (!g.booking && g.people.length === 1) {
            return (
              <li key={g.key} className="flex items-center gap-2 rounded-xl bg-navy-900/80 border border-amber-300/30 pl-3 pr-2 py-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(first)}>
                  <span className="block text-white font-semibold break-words">{first.full_name}</span>
                  <span className="block text-gray-400 text-xs">
                    {level(first)}
                    {first.card?.member_type ? ` · ${t(first.card.member_type === 'fixed' ? 'events.fixedMember' : 'review.kind_guest')}` : ''}
                  </span>
                </button>
                <CancelHistoryBadge name={first.full_name} history={first.cancel_history} />
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" className="min-h-[2.75rem] rounded-lg px-2.5 text-sm text-gray-200 underline-offset-2 hover:underline active:bg-navy-800 sm:min-h-0 sm:py-2" onClick={() => onPlace(first, 'waitlist')} aria-label={t('place.waitlist')}>
                    <span className="sm:hidden">{t('place.waitShort')}</span><span className="hidden sm:inline">{t('place.waitlist')}</span>
                  </button>
                  <button type="button" className="btn-primary text-sm justify-center" onClick={() => onPlace(first, 'main')} aria-label={t('place.main')}>
                    <span className="sm:hidden">{t('place.okShort')}</span><span className="hidden sm:inline">{t('place.main')}</span>
                  </button>
                </div>
              </li>
            );
          }
          const b = g.booking;
          return (
            <li key={g.key} className="rounded-xl bg-navy-900/80 border border-amber-300/30 px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold break-words">{t('people.quickGroup', { name: b?.contact_name || first.full_name, n: g.people.length })}</p>
                  <p className="text-xs mt-0.5">{b?.contact_phone ? <a href={`tel:${b.contact_phone}`} className="text-sky-300">{b.contact_phone}</a> : <span className="text-amber-200">{t('people.quickNoPhone')}</span>}</p>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                  {onDecline && <button type="button" className="btn-secondary text-sm justify-center text-red-300" onClick={() => onDecline(first, g.people.length)}>{t('people.decline')}</button>}
                  <button type="button" className="btn-primary text-sm justify-center" onClick={() => onPlace(first, 'main')}>{g.people.length > 1 ? t('people.approveGroup', { n: g.people.length }) : t('place.main')}</button>
                </div>
              </div>
              <ol className="mt-2 flex flex-col gap-1">
                {g.people.map((p, i) => (
                  <li key={p.id}>
                    <button type="button" className="w-full text-left text-sm rounded-lg px-2 py-1 hover:bg-navy-800" onClick={() => onOpen(p)}>
                      <span className="text-gray-500 tabular-nums">{i + 1}.</span> <span className="text-gray-100">{p.full_name}</span>
                      {p.gender && <span className={`ml-2 text-[11px] ${p.gender === 'male' ? 'text-sky-300' : 'text-pink-300'}`}>{t(`members.${p.gender}`)}</span>}
                      <span className="ml-2 text-[11px] text-gray-400">{level(p)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// The sheet on a name (like the photo): who they are (photo, level, gender, DUPR), role
// chips, where they go — Tạm hoãn duyệt / Đặt vào danh sách chờ / Xác nhận tham gia
// (+ Không chơi for organizers) — then everything else the Host can do for this person:
// check-in / absent, payment, refund, cancel. Same sheet for clubs and communities.
function GuestInfoEditor({ event, row, card, sport, onSaved }) {
  const { t } = useI18n();
  const start = () => ({ full_name: row.full_name || '', gender: card.gender || row.gender || '', dupr_id: row.dupr_id || card.dupr_id || '', dupr_self: row.dupr_level ?? '' });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/events/${event.id}/participants/${row.id}/info`, { ...f, full_name: f.full_name.trim() });
      setOpen(false);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err.payload?.code === 'bad_dupr_id' ? t('ginfo.badId') : err.message);
    } finally {
      setBusy(false);
    }
  }
  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-900/60 px-3 py-2">
        <p className="text-sm text-gray-300">
          {saved ? <span className="text-lime-300">{t('ginfo.saved')}</span> : t('ginfo.noAccount')}
          <Hint inline text={t('ginfo.hint')} />
        </p>
        <button type="button" className="btn-secondary text-sm gap-1.5 ml-auto" onClick={() => { setF(start()); setSaved(false); setOpen(true); }}>
          <UiIcon name="edit" className="w-4 h-4" />
          {t('ginfo.edit')}
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-lg border border-navy-600 bg-navy-900/60 p-3">
      <p className="text-white font-semibold">{t('ginfo.title')}</p>
      <div>
        <label className="text-sm text-gray-300" htmlFor="gi-name">{t('ux.fullName')}</label>
        <input id="gi-name" className="input" required maxLength={120} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
      </div>
      <div>
        <span className="text-sm text-gray-300">{t('members.gender')}</span>
        <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('members.gender')}>
          {['male', 'female'].map((g) => (
            <button key={g} type="button" role="radio" aria-checked={f.gender === g} onClick={() => setF({ ...f, gender: g })} className={`min-h-[2.75rem] rounded-lg border px-3 text-sm font-semibold transition-colors ${f.gender === g ? 'border-lime-400 bg-lime-400/15 text-lime-200' : 'border-navy-600 text-gray-200 hover:border-navy-500'}`}>
              {t(`members.${g}`)}
            </button>
          ))}
        </div>
      </div>
      {sport === 'pickleball' && (
        <div>
          <div>
            <label className="text-sm text-gray-300" htmlFor="gi-id">{t('quick.duprId')} <span className="text-gray-500 text-xs">({t('ux.optional')})</span></label>
            <input id="gi-id" className="input uppercase" maxLength={10} autoCapitalize="characters" value={f.dupr_id} onChange={(e) => setF({ ...f, dupr_id: e.target.value.toUpperCase() })} />
          </div>
        </div>
      )}
      {error && <p className="text-red-300 text-sm" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary text-sm" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
        <button className="btn-primary text-sm" disabled={busy || !f.full_name.trim()}>{busy ? t('auth.working') : t('common.save')}</button>
      </div>
    </form>
  );
}

export function PlaceSheet({ event, person, isHost, onClose, onChanged, actions }) {
  const { t, sport } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const row = person;
  const place = row ? PLACE_OF[row.status] : 'not_playing';
  const organizer = isHost || !!row?.is_organizer;
  const cancelled = row?.status === 'cancelled';
  const locked = row && ['checked_in', 'no_show', 'cancelled'].includes(row.status);
  const options = isHost ? ['not_playing', 'waitlist', 'main'] : organizer ? ['not_playing', 'requested', 'waitlist', 'main'] : ['requested', 'waitlist', 'main'];

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err.payload?.code === 'full' ? t('place.full') : err.payload?.code === 'group_full' ? t('egroups.groupFull') : err.message);
    } finally {
      setBusy(false);
    }
  }
  const go = (to) =>
    run(async () => {
      if (to === place) return;
      if (isHost) await api.post(`/api/events/${event.id}/host-play`, { to });
      else await api.post(`/api/events/${event.id}/participants/${row.id}/place`, { to });
      onClose();
    });
  const setRoles = (patch) => run(() => api.post(`/api/events/${event.id}/participants/${row.id}/roles`, patch));
  // Actions handled by the page (they also refresh money, show messages, open dialogs).
  const act = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const name = row?.full_name || event.host_name || 'Host';
  const c = row?.card || {};
  const level = levelText(c.level ?? row?.dupr_level, sport, t);
  const fee = Number(row?.fee_amount ?? event.fee_amount ?? 0);
  const share = row ? (row.refund_percent != null ? row.refund_percent : row.late_cancel ? 0 : 100) : 0;
  const chip = 'rounded-full border px-3 py-1.5 text-sm disabled:opacity-40';
  return (
    <Modal open title={name} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="relative shrink-0">
            <Avatar src={c.avatar} name={name} size={64} />
            {organizer && <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-sky-500 px-1 text-[11px] leading-5" aria-hidden><UiIcon name="shield" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></span>}
          </span>
          <div className="min-w-0">
            <p className="text-white text-lg font-bold break-words">{name}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-300">
              {level ? <span>{level}</span> : <span className="text-gray-500">{t('people.noLevel')}</span>}
              {c.gender && <span>{t(`members.${c.gender}`)}</span>}
              {sport === 'pickleball' && c.dupr != null && <span className="rounded bg-sky-600 px-1.5 text-xs font-bold text-white">DUPR {Number(c.dupr).toFixed(2)}</span>}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {row ? t(`player.status_${row.status}`) : t('place.hostNoRow')}
              {(c.phone || row?.phone) && <span className="ml-2">{c.phone || row.phone}</span>}
            </p>
            {/* Where this place comes from: the player's own account, a quick booking, or
                added by the Host (the last two have no account). */}
            {row && (
              <p className="mt-1">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${row.user_id ? 'border-lime-400/50 text-lime-200' : 'border-navy-500 text-gray-300'}`}>
                  <UiIcon name={row.user_id ? 'user' : row.guest_booking_id ? 'bolt' : 'userPlus'} className="w-3.5 h-3.5" />
                  {row.user_id ? t('people.srcAccount') : row.guest_booking_id ? t('people.srcQuick') : t('people.srcHost')}
                  {row.user_id && row.email_unverified ? ` · ${t('people.srcUnverified')}` : ''}
                </span>
              </p>
            )}
            {/* The club's name for them is a nickname: the name of their own account too. */}
            {row?.account_name && (
              <p className="text-xs text-gray-400 mt-1">{t('people.accountName', { name: row.account_name })}</p>
            )}
          </div>
        </div>

        {/* Added by hand or booked quickly (no account): the Host fixes their details later
            (e.g. a DUPR ID made after the kèo), so the matches can go to DUPR again. */}
        {row && !row.user_id && !isHost && <GuestInfoEditor event={event} row={row} card={c} sport={sport} onSaved={onChanged} />}

        {/* Kèo with time groups: which group they play in (its fee if not paid yet). */}
        {row && !locked && event.groups?.length > 1 && (
          <div>
            <p className="text-gray-400 text-xs mb-1.5">{t('egroups.group')}</p>
            {/* One button per court ("Sân 2"), its hours under it — equal cells in a grid. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {event.groups.map((g, i) => (
                <button key={g.id} type="button" disabled={busy} aria-pressed={row.group_id === g.id} onClick={() => run(() => api.post(`/api/events/${event.id}/participants/${row.id}/group`, { group_id: g.id }))} className={`min-h-[2.75rem] rounded-xl border px-3 py-2 text-left leading-tight tabular-nums transition-colors disabled:opacity-40 ${row.group_id === g.id ? 'border-lime-400 bg-lime-400/20 text-lime-100' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}>
                  <span className="block text-sm font-semibold">{t('egroups.courtN', { n: g.courts || i + 1 })}</span>
                  <span className="block text-xs opacity-80">{g.start_time}–{g.end_time}{g.play_format ? ` · ${t(`fmt.${g.play_format}`)}` : ''}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-y border-navy-700 py-3">
          <span className="text-gray-400 text-xs mr-1">{t('people.roles')}</span>
          <button
            type="button"
            disabled={busy || isHost || !row || cancelled}
            aria-pressed={organizer}
            onClick={() => setRoles({ is_organizer: !organizer })}
            className={`${chip} ${organizer ? 'border-sky-400 bg-sky-500 text-white' : 'border-navy-600 text-gray-300'} ${isHost ? '!opacity-90' : ''}`}
          >
            {t('people.organizer')}
          </button>
          {row && !cancelled && TAGS.map((tag) => {
            const on = (row.tags || []).includes(tag);
            return (
              <button key={tag} type="button" disabled={busy} aria-pressed={on} onClick={() => setRoles({ tags: on ? row.tags.filter((x) => x !== tag) : [...(row.tags || []), tag] })} className={`${chip} ${on ? 'border-lime-400 bg-lime-400/20 text-lime-100' : 'border-navy-600 text-gray-300'}`}>
                {t(`people.tag_${tag}`)}
              </button>
            );
          })}
        </div>

        {!cancelled && (
          <div>
            <div className={`grid gap-2 ${options.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
              {options.map((o) => (
                <button
                  key={o}
                  type="button"
                  disabled={busy || locked}
                  aria-pressed={place === o}
                  onClick={() => go(o)}
                  className={`rounded-xl border-2 px-2 py-3 text-sm font-semibold disabled:cursor-not-allowed ${locked && place !== o ? 'opacity-40' : ''} ${place === o ? PLACE_TONE[o] : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}
                >
                  <UiIcon name={{ requested: 'pause', waitlist: 'hourglass', main: 'check', not_playing: 'user' }[o]} className="w-5 h-5 mx-auto mb-0.5" />
                  {t(`place.${o}`)}
                </button>
              ))}
            </div>
            {place === 'waitlist' && !locked && <Hint text={t('place.hint_waitlist')} className="mt-2" />}
            {/* Checked in / no-show: the place is fixed until "Hoàn tác" puts them back. */}
            {locked && <p className="text-gray-400 text-sm mt-2">{t(row.status === 'no_show' ? 'place.lockedNoShow' : 'place.lockedCheckedIn')}</p>}
            {/* Still owes the transfer (or waits for the info check): the Host can give the
                place now and collect the fee later — cash at the court, a late transfer. */}
            {row && !isHost && ['pending', 'requested', 'waitlisted'].includes(row.status) && fee > 0 && !row.fee_paid && !(row.tags || []).includes('free') && (
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                <Hint inline text={t('place.unpaidHint')} />
                <button type="button" disabled={busy} className="btn-secondary text-sm" onClick={() => run(async () => { await api.post(`/api/events/${event.id}/participants/${row.id}/place`, { to: 'main', unpaid: true }); onClose(); })}>
                  {t('place.mainUnpaid')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Notes on this place: Khách mời (invited by the Host), Miễn phí (nothing to pay). */}
        {row && !cancelled && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-gray-400 text-xs mr-1">{t('people.notes')}</span>
            {NOTE_TAGS.map((tag) => {
              const on = (row.tags || []).includes(tag);
              return (
                <button key={tag} type="button" disabled={busy} aria-pressed={on} onClick={() => setRoles({ tags: on ? row.tags.filter((x) => x !== tag) : [...(row.tags || []), tag] })} className={`${chip} ${on ? 'border-navy-600 bg-navy-700 text-gray-200' : 'border-navy-600 text-gray-300'}`}>
                  {on ? '✓ ' : ''}{t(`people.tag_${tag}`)}
                </button>
              );
            })}
          </div>
        )}

        {row && actions && (
          <div className="flex flex-wrap justify-center gap-2">
            {['registered', 'checked_in', 'no_show'].includes(row.status) && (
              <>
                {row.status !== 'checked_in' && <button type="button" disabled={busy} className={`${chip} border-lime-400/60 text-lime-200 hover:bg-lime-400/10`} onClick={() => act(() => actions.onAction(row, 'check-in'))}>✓ {t('events.checkIn')}</button>}
                {row.status !== 'no_show' && <button type="button" disabled={busy} className={`${chip} border-yellow-400/60 text-yellow-200 hover:bg-yellow-400/10`} onClick={() => act(() => actions.onAction(row, 'no-show'))}>{t('events.noShow')}</button>}
                {row.status !== 'registered' && <button type="button" disabled={busy} className={`${chip} border-navy-500 text-gray-300`} onClick={() => act(() => actions.onAction(row, 'reset'))}>↺ {t('staffView.undo')}</button>}
              </>
            )}
            {row.status === 'waitlisted' && <button type="button" disabled={busy} className={`${chip} border-sky-400/60 text-sky-200 hover:bg-sky-400/10`} onClick={() => act(() => actions.onAction(row, 'promote'))}>{t('policy.promote')}</button>}
            {/* Money: organisers who play free, a pass, a refund to give back, or paid / not paid. */}
            {(row.tags || []).includes('free') && !cancelled ? (
              <span className={`${chip} border-navy-600 text-gray-200`}>{t('people.tag_free')}</span>
            ) : row.is_organizer && row.fee_amount != null && Number(row.fee_amount) === 0 ? (
              <span className={`${chip} border-navy-600 text-gray-400`}>{t('people.noFee')}</span>
            ) : row.paid_by_plan && !cancelled ? (
              <span className={`${chip} border-lime-400/40 text-lime-300`}>{c.vip ? t(`events.usesPass_${c.vip_period || 'any'}`) : t('events.paidByPlan')}</span>
            ) : cancelled && row.fee_paid && share > 0 ? (
              row.refunded_at ? (
                <button type="button" disabled={busy} className={`${chip} border-navy-500 text-gray-300`} onClick={() => act(() => actions.onRefund(row, true))}>↺ {t('slot.refundUndo')}</button>
              ) : (
                <button type="button" disabled={busy} className={`${chip} border-sky-400/60 text-sky-200 hover:bg-sky-400/10`} onClick={() => act(() => actions.onRefund(row))}>{t('slot.markRefunded')}</button>
              )
            ) : (!cancelled || row.late_cancel || row.fee_paid) && (
              <button type="button" disabled={busy} aria-pressed={!!row.fee_paid} className={`${chip} ${row.fee_paid ? 'border-navy-500 text-gray-200' : 'border-lime-400 bg-lime-400/15 text-lime-200'}`} onClick={() => act(() => actions.onFee(row))}>
                {/* The button says what pressing it does: not paid yet -> "Đã thu", paid -> "Chưa thu". */}
                {row.fee_paid ? `↺ ${t('people.markUnpaid')}` : `${t('people.markPaid')}`}
              </button>
            )}
            {cancelled && row.late_cancel && (
              <button type="button" disabled={busy} className={`${chip} border-orange-400/60 text-orange-200`} onClick={() => window.confirm(t('policy.waiveAsk', { name })) && act(() => actions.onAction(row, 'waive'))}>{t('policy.waive')}</button>
            )}
            {!cancelled && (
              <button type="button" disabled={busy} className={`${chip} border-red-500/60 text-red-300 hover:bg-red-500/10`} onClick={() => { onClose(); actions.onCancel(row); }}>✕ {t('events.cancel')}</button>
            )}
            {/* Cancelled by the Host (by mistake): put them back — main list if there is room,
                checked in when the kèo is over or they already have matches. */}
            {cancelled && row.cancelled_by !== 'player' && !row.refunded_at && (
              <button
                type="button"
                disabled={busy}
                className={`${chip} border-lime-400/60 text-lime-200 hover:bg-lime-400/10`}
                onClick={() => window.confirm(t('people.restoreAsk', { name })) && run(async () => { await api.post(`/api/events/${event.id}/participants/${row.id}/restore`, {}); onClose(); })}
              >
                ↺ {t('people.restore')}
              </button>
            )}
            {/* A test sign-up that was cancelled: delete it so it does not count as a cancel. */}
            {cancelled && (
              <button
                type="button"
                disabled={busy || (row.fee_paid && !row.refunded_at)}
                className={`${chip} border-red-500/60 text-red-300 hover:bg-red-500/10`}
                onClick={() => window.confirm(t('people.deleteHistoryAsk', { name })) && run(async () => { await api.del(`/api/events/${event.id}/participants/${row.id}`); onClose(); })}
              >
                {t('people.deleteHistory')}
              </button>
            )}
          </div>
        )}
        {cancelled && row.fee_paid && !row.refunded_at && <p className="text-xs text-gray-400 text-center">{t('people.deleteHistoryPaid')}</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    </Modal>
  );
}
