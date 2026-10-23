'use client';
import { useState } from 'react';
import CourtRotation from '@/components/CourtRotation';
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
  const pool = (rows) => (onlyHere ? rows.filter((p) => p.status === 'checked_in') : rows);
  const poolText = (rows) => (onlyHere ? t('courts.here', { n: pool(rows).length }) : t('courts.allMain', { n: rows.length }));

  async function move(p, groupId) {
    setBusy(p.id);
    try {
      await api.post(moveUrl(p), { group_id: groupId });
      onMoved(p.id, groupId);
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
      <div className="flex flex-col gap-4">
        {boards.map((b) => {
          const labels = b.g ? courtLabels(b.g.courts) : [];
          return (
            <section key={b.g?.id || 'none'} className="card !px-3 sm:!px-4">
              <h3 className="text-white font-semibold mb-2 tabular-nums">
                {b.title}
                {b.g && <span className="text-gray-400 font-normal"> · {b.people.length}/{b.g.slots}</span>}
              </h3>
              {b.people.length === 0 ? (
                <p className="text-gray-500 text-sm mb-2">{t('courts.nobody')}</p>
              ) : (
                <ul className="divide-y divide-navy-700 mb-3">
                  {b.people.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-white break-words">{p.full_name}</span>
                        <span className="block text-xs text-gray-400">
                          {p.status === 'checked_in' ? <span className="text-lime-300">{t('staffView.here')}</span> : t('courts.notHere')}
                          {p.gender ? ` · ${t(`members.${p.gender}`)}` : ''}
                          {p.dupr_level != null ? ` · ${levelTag(p.dupr_level, ev.sport, t)}` : ''}
                        </span>
                      </span>
                      <label className="sr-only" htmlFor={`mv-${p.id}`}>{t('egroups.group')}</label>
                      <select id={`mv-${p.id}`} className="input !w-auto min-h-[2.75rem] text-sm" disabled={busy === p.id} value={p.group_id || ''} onChange={(e) => e.target.value && move(p, e.target.value)}>
                        {!b.g && <option value="">—</option>}
                        {groups.map((g, i) => (
                          <option key={g.id} value={g.id}>{t('egroups.courtN', { n: g.courts || i + 1 })} · {g.start_time}–{g.end_time}</option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
              {b.g && (
                <CourtRotation key={b.g.id} players={pool(b.people)} poolText={poolText(b.people)} matches={ev.matches} defaultCourts={labels.length || 1} labels={labels.length ? labels : null} endpoint={endpoint} extraBody={extraBody} sport={ev.sport} onSaved={onSaved} />
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
