'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

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
      <p className="text-gray-500 text-xs mb-3">{t('people.organizersHint')}</p>
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
      <p className="text-gray-400 text-xs mb-2">{t('people.requestsHint')}</p>
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
            <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => onPlace(p, 'waitlist')}>⏳ {t('place.waitlist')}</button>
            <button type="button" className="btn-primary !py-1 text-xs" onClick={() => onPlace(p, 'main')}>✓ {t('place.main')}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The sheet on a name (like the photo): role chips, then where they go —
// Tạm hoãn duyệt / Đặt vào danh sách chờ / Xác nhận tham gia (+ Không chơi for organizers).
export function PlaceSheet({ event, person, isHost, onClose, onChanged }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const row = person;
  const place = row ? PLACE_OF[row.status] : 'not_playing';
  const organizer = isHost || !!row?.is_organizer;
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

  const name = row?.full_name || event.host_name || 'Host';
  return (
    <Modal open title={name} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Initial name={name} organizer={organizer} />
          <div className="min-w-0 text-sm text-gray-300">
            {row?.dupr_level != null && <span className="mr-2">{t('common.level')} {Number(row.dupr_level).toFixed(2)}</span>}
            {row?.phone && <span className="mr-2">📞 {row.phone}</span>}
            {row && <span className="text-gray-400">{t(`player.status_${row.status}`)}</span>}
            {!row && <span className="text-gray-400">{t('place.hostNoRow')}</span>}
          </div>
        </div>

        <div>
          <p className="text-gray-400 text-xs mb-1.5">{t('people.roles')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || isHost || !row}
              aria-pressed={organizer}
              onClick={() => setRoles({ is_organizer: !organizer })}
              className={`rounded-full border px-3 py-1 text-sm ${organizer ? 'border-sky-400 bg-sky-400/20 text-sky-100' : 'border-navy-600 text-gray-300'} ${isHost ? 'opacity-80' : ''}`}
            >
              🛡 {t('people.organizer')}
            </button>
            {row && TAGS.map((tag) => {
              const on = (row.tags || []).includes(tag);
              return (
                <button key={tag} type="button" disabled={busy} aria-pressed={on} onClick={() => setRoles({ tags: on ? row.tags.filter((x) => x !== tag) : [...(row.tags || []), tag] })} className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-lime-400 bg-lime-400/15 text-lime-100' : 'border-navy-600 text-gray-300'}`}>
                  {t(`people.tag_${tag}`)}
                </button>
              );
            })}
          </div>
          {isHost && <p className="text-gray-500 text-xs mt-1">{t('people.hostAlways')}</p>}
        </div>

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
        <p className="text-gray-500 text-xs">{locked ? t('place.locked') : t(`place.hint_${place}`)}</p>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    </Modal>
  );
}
