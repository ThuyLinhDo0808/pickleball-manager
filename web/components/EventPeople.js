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

// Where someone stands on the list, as the sheet's buttons name it.
export const PLACE_OF = { requested: 'requested', waitlisted: 'waitlist', not_playing: 'not_playing', registered: 'main', pending: 'main', checked_in: 'main', no_show: 'main' };
const PLACE_TONE = {
  requested: 'border-amber-300 bg-amber-300/15 text-amber-100',
  waitlist: 'border-sky-400 bg-sky-400/15 text-sky-100',
  main: 'border-lime-400 bg-lime-400/20 text-lime-100',
  not_playing: 'border-gray-400 bg-gray-400/10 text-gray-100',
};
const TAGS = ['coach', 'referee'];

function Initial({ name, organizer }) {
  return (
    <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-navy-700 text-lg font-bold text-white">
      {(name || '?').trim().charAt(0).toUpperCase()}
      {organizer && <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-sky-500 px-1 text-[10px] leading-4" aria-hidden>🛡</span>}
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
      <h3 className="text-gray-300 text-xs font-semibold uppercase tracking-wide mb-1">{t('people.organizers')} · {list.length}</h3>
      <Hint text={t('people.organizersHint')} className="mb-3" />
      <div className="flex flex-wrap gap-4">
        {list.map((o) => {
          const place = o.row ? PLACE_OF[o.row.status] : 'not_playing';
          return (
            <button key={o.key} type="button" onClick={() => onOpen(o.row, o.host)} className="flex w-20 flex-col items-center gap-1 text-center">
              <Initial name={o.name} organizer />
              <span className="text-white text-xs leading-tight line-clamp-2">{o.name}</span>
              <span className={`rounded-full border px-1.5 text-[10px] ${PLACE_TONE[place]}`}>{t(`place.short_${place}`)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Sign-ups waiting for the Host to check them (level, who they are) before they get a place.
export function RequestsSection({ rows, onPlace, onOpen }) {
  const { t } = useI18n();
  if (!rows.length) return null;
  return (
    <section className="card mb-4 border-amber-300/40">
      <h3 className="text-amber-200 font-semibold">🙋 {t('people.requests')} ({rows.length})</h3>
      <Hint text={t('people.requestsHint')} className="mb-2" />
      <ul className="divide-y divide-navy-700">
        {rows.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(p)}>
              <span className="block text-white font-semibold truncate">{p.full_name}</span>
              <span className="block text-gray-400 text-xs">
                {p.dupr_level != null ? `${t('common.level')} ${Number(p.dupr_level).toFixed(2)}` : t('people.noLevel')}
                {p.card?.member_type ? ` · ${t(p.card.member_type === 'fixed' ? 'events.fixedMember' : 'review.kind_guest')}` : ''}
              </span>
            </button>
            <CancelHistoryBadge name={p.full_name} history={p.cancel_history} />
            <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => onPlace(p, 'waitlist')}>⏳ {t('place.waitlist')}</button>
            <button type="button" className="btn-primary !py-1 text-xs" onClick={() => onPlace(p, 'main')}>✓ {t('place.main')}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The sheet on a name (like the photo): who they are (photo, level, gender, DUPR), role
// chips, where they go — Tạm hoãn duyệt / Đặt vào danh sách chờ / Xác nhận tham gia
// (+ Không chơi for organizers) — then everything else the Host can do for this person:
// check-in / absent, payment, refund, cancel. Same sheet for clubs and communities.
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
      setError(err.payload?.code === 'full' ? t('place.full') : err.message);
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
            {organizer && <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-sky-500 px-1 text-[11px] leading-5" aria-hidden>🛡</span>}
          </span>
          <div className="min-w-0">
            <p className="text-white text-lg font-bold truncate">{name}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-300">
              {level ? <span>🎯 {level}</span> : <span className="text-gray-500">{t('people.noLevel')}</span>}
              {c.gender && <span>{c.gender === 'male' ? '♂' : '♀'} {t(`members.${c.gender}`)}</span>}
              {sport === 'pickleball' && c.dupr != null && <span className="rounded bg-sky-600 px-1.5 text-xs font-bold text-white">DUPR {Number(c.dupr).toFixed(2)}</span>}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {row ? t(`player.status_${row.status}`) : t('place.hostNoRow')}
              {(c.phone || row?.phone) && <span className="ml-2">📞 {c.phone || row.phone}</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-y border-navy-700 py-3">
          <span className="text-gray-400 text-xs mr-1">{t('people.roles')}</span>
          <button
            type="button"
            disabled={busy || isHost || !row || cancelled}
            aria-pressed={organizer}
            onClick={() => setRoles({ is_organizer: !organizer })}
            className={`${chip} ${organizer ? 'border-sky-400 bg-sky-500 text-white' : 'border-navy-600 text-gray-300'} ${isHost ? '!opacity-90' : ''}`}
          >
            🛡 {t('people.organizer')}
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
                  className={`rounded-xl border-2 px-2 py-3 text-sm font-semibold ${place === o ? PLACE_TONE[o] : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}
                >
                  <span className="block text-xl mb-0.5">{{ requested: '⏸', waitlist: '⏳', main: '✓', not_playing: '🧑‍💼' }[o]}</span>
                  {t(`place.${o}`)}
                </button>
              ))}
            </div>
            {place === 'waitlist' && !locked && <Hint text={t('place.hint_waitlist')} className="mt-2" />}
          </div>
        )}

        {row && actions && (
          <div className="flex flex-wrap justify-center gap-2">
            {['registered', 'checked_in', 'no_show'].includes(row.status) && (
              <>
                {row.status !== 'checked_in' && <button type="button" disabled={busy} className={`${chip} border-lime-400/60 text-lime-200 hover:bg-lime-400/10`} onClick={() => act(() => actions.onAction(row, 'check-in'))}>✓ {t('events.checkIn')}</button>}
                {row.status !== 'no_show' && <button type="button" disabled={busy} className={`${chip} border-yellow-400/60 text-yellow-200 hover:bg-yellow-400/10`} onClick={() => act(() => actions.onAction(row, 'no-show'))}>🚫 {t('events.noShow')}</button>}
                {row.status !== 'registered' && <button type="button" disabled={busy} className={`${chip} border-navy-500 text-gray-300`} onClick={() => act(() => actions.onAction(row, 'reset'))}>↺ {t('staffView.undo')}</button>}
              </>
            )}
            {row.status === 'waitlisted' && <button type="button" disabled={busy} className={`${chip} border-sky-400/60 text-sky-200 hover:bg-sky-400/10`} onClick={() => act(() => actions.onAction(row, 'promote'))}>⬆ {t('policy.promote')}</button>}
            {/* Money: organisers who play free, a pass, a refund to give back, or paid / not paid. */}
            {row.is_organizer && row.fee_amount != null && Number(row.fee_amount) === 0 ? (
              <span className={`${chip} border-navy-600 text-gray-400`}>{t('people.noFee')}</span>
            ) : row.paid_by_plan && !cancelled ? (
              <span className={`${chip} border-lime-400/40 text-lime-300`}>{c.vip ? t(`events.usesPass_${c.vip_period || 'any'}`) : t('events.paidByPlan')}</span>
            ) : cancelled && row.fee_paid && share > 0 ? (
              row.refunded_at ? (
                <button type="button" disabled={busy} className={`${chip} border-navy-500 text-gray-300`} onClick={() => act(() => actions.onRefund(row, true))}>↺ {t('slot.refundUndo')}</button>
              ) : (
                <button type="button" disabled={busy} className={`${chip} border-sky-400/60 text-sky-200 hover:bg-sky-400/10`} onClick={() => act(() => actions.onRefund(row))}>💸 {t('slot.markRefunded')}</button>
              )
            ) : (!cancelled || row.late_cancel || row.fee_paid) && (
              <button type="button" disabled={busy} aria-pressed={!!row.fee_paid} className={`${chip} ${row.fee_paid ? 'border-lime-400 bg-lime-400/15 text-lime-200' : 'border-navy-500 text-gray-200'}`} onClick={() => act(() => actions.onFee(row))}>
                {row.fee_paid ? `✓ ${t('common.paid')}` : t('common.unpaid')}
                {!row.fee_paid && fee > 0 && ` · ${formatVnd(fee)}`}
              </button>
            )}
            {cancelled && row.late_cancel && (
              <button type="button" disabled={busy} className={`${chip} border-orange-400/60 text-orange-200`} onClick={() => window.confirm(t('policy.waiveAsk', { name })) && act(() => actions.onAction(row, 'waive'))}>{t('policy.waive')}</button>
            )}
            {!cancelled && (
              <button type="button" disabled={busy} className={`${chip} border-red-500/60 text-red-300 hover:bg-red-500/10`} onClick={() => { onClose(); actions.onCancel(row); }}>✕ {t('events.cancel')}</button>
            )}
          </div>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    </Modal>
  );
}
