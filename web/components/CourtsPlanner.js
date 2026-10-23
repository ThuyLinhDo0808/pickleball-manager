'use client';
import { useState } from 'react';
import CourtRotation from '@/components/CourtRotation';
import { useI18n } from '@/context/I18nContext';

const courtLabels = (raw) => String(raw || '').split(/[,;/\s-]+/).map((x) => x.replace(/^sân/i, '').trim()).filter(Boolean);
const MAIN = ['registered', 'pending', 'checked_in'];

// "Xếp trận" (Host and coordinator, under Trận đấu / Tỷ số): rounds set up automatically on
// each court / time group's courts — fair turns, similar levels together — then each
// court's score is saved as a match. "Chỉ người đã đến" keeps the pool to who checked in.
// people: { id, full_name, status, dupr_level, group_id }.
export default function CourtsPlanner({ ev, people, endpoint, extraBody = {}, onSaved }) {
  const { t } = useI18n();
  const groups = ev.groups?.length > 1 ? ev.groups : null;
  const main = people.filter((p) => MAIN.includes(p.status));
  const [onlyHere, setOnlyHere] = useState(() => main.some((p) => p.status === 'checked_in'));
  const pool = (rows) => (onlyHere ? rows.filter((p) => p.status === 'checked_in') : rows);
  const poolText = (rows) => (onlyHere ? t('courts.here', { n: pool(rows).length }) : t('courts.allMain', { n: rows.length }));
  const boards = groups
    ? groups.map((g, i) => ({ key: g.id, title: `${t('egroups.courtN', { n: g.courts || i + 1 })}${g.play_format ? ` · ${t(`fmt.${g.play_format}`)}` : ''} · ${g.start_time}–${g.end_time}`, labels: courtLabels(g.courts), people: main.filter((p) => p.group_id === g.id) }))
    : [{ key: 'all', title: null, labels: courtLabels(ev.court_labels), people: main }];
  return (
    <>
      <label className="flex items-center gap-2 text-sm text-gray-200 mb-3 min-h-[2.75rem]">
        <input type="checkbox" checked={onlyHere} onChange={(e) => setOnlyHere(e.target.checked)} />
        {t('courts.onlyHere')}
      </label>
      <div className="flex flex-col gap-4">
        {boards.map((b) => (
          <section key={b.key}>
            {b.title && <h3 className="text-white font-semibold mb-2 tabular-nums">{b.title}</h3>}
            <CourtRotation players={pool(b.people)} poolText={poolText(b.people)} matches={ev.matches} defaultCourts={b.labels.length || (groups ? 1 : ev.courts)} labels={b.labels.length ? b.labels : null} endpoint={endpoint} extraBody={extraBody} sport={ev.sport} onSaved={onSaved} />
          </section>
        ))}
      </div>
    </>
  );
}
