'use client';
import { useState } from 'react';
import CourtRotation from '@/components/CourtRotation';
import Modal from '@/components/Modal';
import { Avatar } from '@/components/PlayerChip';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { levelTag } from '@/lib/levels';
const courtLabels = (raw) => String(raw || '').split(/[,;/\s-]+/).map((x) => x.replace(/^sân/i, '').trim()).filter(Boolean);
const MAIN = ['registered', 'pending', 'checked_in'];

// "Xếp sân" (Host and coordinator): the players of each court / time group (move someone
// to another court), then the rounds on that group's courts — set up automatically, fair
// turns, similar levels together. "Chỉ người đã đến" keeps the pool to who has checked in.
// people: { id, full_name, status, gender, dupr_level, group_id }.
export default function CourtsPlanner({ ev, people, endpoint, extraBody = {}, moveUrl, onMoved, onSaved }) {
  const { t } = useI18n();
  const groups = ev.groups?.length > 1 ? ev.groups : null;
  const main = people.filter((p) => MAIN.includes(p.status));
  const [onlyHere, setOnlyHere] = useState(() => main.some((p) => p.status === 'checked_in'));
  const [busy, setBusy] = useState(null);
  const [moving, setMoving] = useState(null); // the player whose court is being changed
  const pool = (rows) => (onlyHere ? rows.filter((p) => p.status === 'checked_in') : rows);
  const poolText = (rows) => (onlyHere ? t('courts.here', { n: pool(rows).length }) : t('courts.allMain', { n: rows.length }));

  async function move(p, groupId) {
    setBusy(p.id);
    try {
      await api.post(moveUrl(p), { group_id: groupId });
      onMoved(p.id, groupId);
      setMoving(null);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(null);
    }
  }

  const toggle = (
    <label className="flex items-center gap-2 text-sm text-gray-200 mb-3 min-h-[2.75rem]">
      <input type="checkbox" checked={onlyHere} onChange={(e) => setOnlyHere(e.target.checked)} />
      {t('courts.onlyHere')}
    </label>
  );
  if (!groups) {
    const labels = courtLabels(ev.court_labels);
    return (
      <>
        {toggle}
        <section className="card !px-3 sm:!px-4 mb-3">
          <h3 className="text-white font-semibold mb-2 tabular-nums">{t('elive.allPlayers')}<span className="text-gray-400 font-normal"> · {main.length}{ev.slots ? `/${ev.slots}` : ''}</span></h3>
          <Tiles people={main} slots={ev.slots || 0} sport={ev.sport} t={t} />
        </section>
        <CourtRotation players={pool(main)} poolText={poolText(main)} matches={ev.matches} defaultCourts={ev.courts} labels={labels.length ? labels : null} endpoint={endpoint} extraBody={extraBody} sport={ev.sport} onSaved={onSaved} />
      </>
    );
  }
  const boards = [
    ...groups.map((g, i) => ({ g, title: `${t('egroups.courtN', { n: g.courts || i + 1 })}${g.play_format ? ` · ${t(`fmt.${g.play_format}`)}` : ''} · ${g.start_time}–${g.end_time}`, people: main.filter((p) => p.group_id === g.id) })),
    { g: null, title: t('egroups.noCourt'), people: main.filter((p) => !groups.some((g) => g.id === p.group_id)) },
  ].filter((b) => b.g || b.people.length);
  return (
    <>
      {toggle}
      <p className="text-gray-400 text-xs -mt-1 mb-3">{t('courts.tapToMove')}</p>
      <div className="flex flex-col gap-4">
        {boards.map((b) => {
          const labels = b.g ? courtLabels(b.g.courts) : [];
          return (
            <section key={b.g?.id || 'none'} className="card !px-3 sm:!px-4">
              <h3 className="text-white font-semibold mb-2 tabular-nums">
                {b.title}
                {b.g && <span className="text-gray-400 font-normal"> · {b.people.length}/{b.g.slots}</span>}
              </h3>
              <Tiles people={b.people} slots={b.g?.slots || 0} sport={ev.sport} t={t} onOpen={setMoving} />
              {b.g && (
                <CourtRotation key={b.g.id} players={pool(b.people)} poolText={poolText(b.people)} matches={ev.matches} defaultCourts={labels.length || 1} labels={labels.length ? labels : null} endpoint={endpoint} extraBody={extraBody} sport={ev.sport} onSaved={onSaved} />
              )}
            </section>
          );
        })}
      </div>
      {/* Tap a player: move them to another court / time group. */}
      <Modal open={!!moving} title={moving ? `${t('egroups.group')} · ${moving.full_name}` : ''} onClose={() => setMoving(null)}>
        {moving && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {groups.map((g, i) => (
              <button key={g.id} type="button" disabled={busy === moving.id} aria-pressed={moving.group_id === g.id} onClick={() => (moving.group_id === g.id ? setMoving(null) : move(moving, g.id))} className={`min-h-[2.75rem] rounded-xl border px-3 py-2 text-left leading-tight tabular-nums disabled:opacity-40 ${moving.group_id === g.id ? 'border-lime-400 bg-lime-400/20 text-lime-100' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}>
                <span className="block text-sm font-semibold">{t('egroups.courtN', { n: g.courts || i + 1 })}</span>
                <span className="block text-xs opacity-80">{g.start_time}–{g.end_time}{g.play_format ? ` · ${t(`fmt.${g.play_format}`)}` : ''}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

// One tile per player (photo, name, gender · level, arrived or not) like the Host's court
// boards, then a dashed tile for each place nobody has taken yet.
function Tiles({ people, slots, sport, t, onOpen }) {
  const free = Math.max(slots - people.length, 0);
  if (!people.length && !free) return <p className="text-gray-500 text-sm mb-2">{t('courts.nobody')}</p>;
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-3">
      {people.map((p) => {
        const here = p.status === 'checked_in';
        const body = (
          <>
            <Avatar src={p.avatar} uid={p.avatar_uid} v={p.avatar_v} name={p.full_name} size={44} />
            <span className="text-white text-sm font-semibold break-words leading-tight">{p.full_name}</span>
            <span className="text-xs text-gray-400">{[p.gender ? t(`members.${p.gender}`) : null, p.dupr_level != null ? levelTag(p.dupr_level, sport, t) : null].filter(Boolean).join(' · ') || '—'}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${here ? 'border-lime-400/60 text-lime-300' : 'border-navy-500 text-gray-400'}`}>{here ? t('staffView.here') : t('courts.notHere')}</span>
          </>
        );
        const cls = 'flex h-full w-full flex-col items-center gap-1 rounded-xl border border-navy-600 bg-navy-900/50 p-2.5 text-center';
        return (
          <li key={p.id}>
            {onOpen ? (
              <button type="button" onClick={() => onOpen(p)} className={`${cls} hover:border-navy-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400`}>{body}</button>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
      {Array.from({ length: free }, (_, i) => (
        <li key={`free-${i}`} aria-label={t('egroups.freeSlot')} className="flex min-h-[8.5rem] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-navy-600 p-2.5 text-center text-gray-500">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-navy-500 text-lg" aria-hidden>+</span>
          <span className="text-xs">{t('egroups.freeSlot')}</span>
        </li>
      ))}
    </ul>
  );
}
