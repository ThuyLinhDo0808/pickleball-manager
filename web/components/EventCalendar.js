'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { formatVnd } from '@/lib/format';
import { api } from '@/lib/api';
import { formatDay, hhmm, layoutLanes, monthGrid, span, todayYmd, weekDays, weekdayLabels } from '@/lib/dates';

// Block colours by status (dark surface). Text stays light for contrast.
export const STATUS_STYLE = {
  open: 'bg-lime-400/15 border-lime-400 text-lime-50',
  draft: 'bg-slate-400/15 border-slate-400 text-slate-100',
  closed: 'bg-amber-400/15 border-amber-400 text-amber-50',
  completed: 'bg-sky-400/15 border-sky-400 text-sky-50',
  cancelled: 'bg-red-500/10 border-red-400/60 text-red-200 line-through',
};

// What the Host can set: upcoming (open), completed (automatic once the slot is over), cancelled.
// draft / closed only show on events made before that rule.
export const LEGEND_STATUSES = ['open', 'completed', 'cancelled'];

// Solid colour per status for small dots (phone month view, timeline).
export const STATUS_DOT = {
  open: 'bg-lime-400',
  draft: 'bg-slate-400',
  closed: 'bg-amber-400',
  completed: 'bg-sky-400',
  cancelled: 'bg-red-400',
};

// Icon per kind of activity (tournaments come from their own table).
export const KIND_ICON = { weekly: '🗓', game: '🏓', training: '🎯', meeting: '👥', challenge: '⚔️', tournament: '🏆' };
export const hrefOf = (e) => e.href || `/events/${e.id}`;
const Kind = ({ e }) => (KIND_ICON[e.kind] ? <span aria-hidden="true">{KIND_ICON[e.kind]} </span> : null);

const HOUR_PX = 48; // height of one hour in week/day views

function byDay(events) {
  const map = {};
  for (const e of events) (map[e.event_date] = map[e.event_date] || []).push(e);
  for (const k of Object.keys(map)) map[k].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  return map;
}

// Visible hour range: 6:00–23:00 by default, widened to fit every event shown.
function hourRange(events) {
  let from = 6;
  let to = 23;
  for (const e of events) {
    const s = span(e);
    if (!s) continue;
    from = Math.min(from, Math.floor(s.start / 60));
    to = Math.max(to, Math.ceil(s.end / 60));
  }
  return { from, to: Math.min(to, 24) };
}

function Fill({ e }) {
  if (e.slots == null) return null;
  const full = e.main_count >= e.slots;
  return (
    <span className={`tabular-nums ${full ? 'text-orange-300' : 'opacity-80'}`}>
      {e.main_count}/{e.slots}
      {e.waitlist_count > 0 && ` +${e.waitlist_count}`}
    </span>
  );
}

// ---- Month ----------------------------------------------------------------
function MonthView({ date, events, onPickDay }) {
  const { t, lang } = useI18n();
  const map = byDay(events);
  const month = date.slice(0, 7);
  const today = todayYmd();
  return (
    <div className="card !p-0 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-navy-700 text-center text-xs text-gray-400">
        {weekdayLabels(lang).map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {monthGrid(date).map((d) => {
          const list = map[d] || [];
          const other = d.slice(0, 7) !== month;
          return (
            <button
              type="button"
              key={d}
              onClick={() => onPickDay(d)}
              className={`min-h-[4.5rem] sm:min-h-[6.5rem] border-b border-r border-navy-700 p-1 text-left align-top hover:bg-navy-700/60 transition ${other ? 'bg-navy-900/60' : ''}`}
            >
              <div className={`text-xs mb-1 tabular-nums ${d === today ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-lime-400 text-navy-950 font-bold' : other ? 'text-gray-600' : 'text-gray-300'}`}>
                {Number(d.slice(8))}
              </div>
              {/* phone: dots; wider screens: chips */}
              <div className="flex flex-wrap gap-0.5 sm:hidden">
                {list.slice(0, 4).map((e) => <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[e.status]}`} />)}
              </div>
              <div className="hidden sm:block space-y-0.5">
                {list.slice(0, 3).map((e) => (
                  <div key={e.id} className={`truncate rounded border-l-2 px-1 text-[11px] ${STATUS_STYLE[e.status]}`}>
                    {hhmm(e.start_time)} <Kind e={e} />{e.title}
                  </div>
                ))}
                {list.length > 3 && <div className="text-[11px] text-gray-400">{t('cal.more', { n: list.length - 3 })}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Time grid (week = 7 columns, day = 1 column) ---------------------------
function Block({ e, lane, lanes, from }) {
  const s = span(e);
  const width = 100 / lanes;
  const top = ((s.start - from * 60) / 60) * HOUR_PX;
  const height = Math.max(((s.end - s.start) / 60) * HOUR_PX - 2, 22);
  return (
    <Link
      href={hrefOf(e)}
      className={`absolute rounded-md border-l-4 px-1.5 py-1 text-[11px] leading-tight overflow-hidden hover:brightness-125 hover:z-10 ${STATUS_STYLE[e.status]}`}
      style={{ top, height, left: `calc(${lane * width}% + 2px)`, width: `calc(${width}% - 4px)` }}
      title={`${hhmm(e.start_time)}–${hhmm(e.end_time)} ${e.title}`}
    >
      <div className="font-semibold truncate"><Kind e={e} />{e.title}</div>
      <div className="opacity-80 truncate">{hhmm(e.start_time)}–{hhmm(e.end_time) || '…'}</div>
      <Fill e={e} />
    </Link>
  );
}

function TimeGrid({ days, events, onPickDay }) {
  const { t, lang } = useI18n();
  const map = byDay(events);
  const shown = days.flatMap((d) => map[d] || []);
  const { from, to } = hourRange(shown);
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const today = todayYmd();
  const single = days.length === 1;
  const untimed = shown.filter((e) => !span(e));
  // Open scrolled to the first session of the period (the grid starts at 6:00).
  const body = useRef(null);
  const firstStart = Math.min(...shown.map((e) => span(e)?.start ?? Infinity));
  const scrollKey = days[0];
  useEffect(() => {
    if (body.current) body.current.scrollTop = Number.isFinite(firstStart) ? Math.max(((firstStart - from * 60) / 60) * HOUR_PX - 16, 0) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey, firstStart]);

  return (
    <div className="card !p-0 overflow-x-auto">
      <div style={{ minWidth: single ? 0 : 720 }}>
        {/* header */}
        <div className="grid border-b border-navy-700" style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }}>
          <div />
          {days.map((d) => (
            <button type="button" key={d} onClick={() => onPickDay(d)} className={`py-2 text-center text-xs hover:bg-navy-700/60 ${d === today ? 'text-lime-400 font-bold' : 'text-gray-300'}`}>
              {formatDay(d, lang, single ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'numeric' })}
            </button>
          ))}
        </div>
        {untimed.length > 0 && (
          <div className="grid border-b border-navy-700" style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }}>
            <div className="text-[10px] text-gray-500 p-1">{t('cal.allDay')}</div>
            {days.map((d) => (
              <div key={d} className="p-0.5 space-y-0.5">
                {(map[d] || []).filter((e) => !span(e)).map((e) => (
                  <Link key={e.id} href={hrefOf(e)} className={`block truncate rounded border-l-2 px-1 text-[11px] ${STATUS_STYLE[e.status]}`}><Kind e={e} />{e.title}</Link>
                ))}
              </div>
            ))}
          </div>
        )}
        {/* body: scrolls vertically inside the card */}
        <div ref={body} className="max-h-[65vh] overflow-y-auto">
        <div className="grid relative pt-2" style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }}>
          <div>
            {hours.map((h) => (
              <div key={h} className="text-[10px] text-gray-500 text-right pr-1 -translate-y-1.5" style={{ height: HOUR_PX }}>{`${h}:00`}</div>
            ))}
          </div>
          {days.map((d) => {
            const items = layoutLanes((map[d] || []).map((e) => ({ e, span: span(e) })).filter((x) => x.span));
            return (
              <div key={d} className={`relative border-l border-navy-700 ${d === today ? 'bg-lime-400/[0.03]' : ''}`} style={{ height: hours.length * HOUR_PX }}>
                {hours.map((h) => <div key={h} className="border-t border-navy-700/70" style={{ height: HOUR_PX }} />)}
                {items.map(({ e, lane, lanes }) => <Block key={e.id} e={e} lane={lane} lanes={lanes} from={from} />)}
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
}

// Edit / delete / cancel straight from the day's timeline. Nobody signed up → delete;
// people signed up → cancel (they get a message; the list and payments are kept).
function DayActions({ e, onChanged }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  if (e.kind === 'tournament') return null;
  const people = Number(e.main_count || 0) + Number(e.waitlist_count || 0);
  const canDelete = people === 0;
  const canCancel = !canDelete && e.status !== 'cancelled' && e.status !== 'completed';

  async function run(fn, ask) {
    if (!window.confirm(ask)) return;
    setBusy(true);
    try {
      await fn();
      onChanged?.();
    } catch (err) {
      if (err.payload?.code === 'has_activity' && window.confirm(t('manage.deleteForceAsk', { people: 0, money: err.payload.transactions }))) {
        try {
          await api.del(`/api/events/${e.id}?force=1`);
          onChanged?.();
        } catch (e2) {
          window.alert(e2.message);
        }
      } else {
        window.alert(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 mt-1.5">
      {e.status !== 'cancelled' && (
        <Link href={`/events/${e.id}/edit`} className="rounded-md border border-navy-600 px-2 py-0.5 text-xs text-gray-200 hover:border-lime-400">✏️ {t('common.edit')}</Link>
      )}
      {canDelete && (
        <button
          type="button"
          disabled={busy}
          className="rounded-md border border-red-500/60 px-2 py-0.5 text-xs text-red-400 hover:bg-red-500/10"
          onClick={() => run(() => api.del(`/api/events/${e.id}`), t('manage.deleteAsk', { title: e.title }))}
        >
          🗑 {t('common.delete')}
        </button>
      )}
      {canCancel && (
        <button
          type="button"
          disabled={busy}
          className="rounded-md border border-orange-400/60 px-2 py-0.5 text-xs text-orange-300 hover:bg-orange-400/10"
          title={t('manage.cancelHint', { n: people })}
          onClick={() => run(() => api.patch(`/api/events/${e.id}`, { status: 'cancelled' }), t('manage.cancelAskN', { title: e.title, n: people }))}
        >
          ✕ {t('manage.cancelEvent')}
        </button>
      )}
    </div>
  );
}

// ---- Day: time grid + the day's events as a detailed timeline ----------------
function DayView({ date, events, onPickDay, onChanged }) {
  const { t } = useI18n();
  const list = byDay(events)[date] || [];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <TimeGrid days={[date]} events={events} onPickDay={onPickDay} />
      <div className="card order-first lg:order-none">
        <h3 className="text-white font-semibold mb-3">{t('cal.dayTimeline')}</h3>
        {list.length === 0 && <p className="text-gray-400 text-sm">{t('cal.freeDay')}</p>}
        <ol className="relative border-l border-navy-600 ml-2 space-y-4">
          {list.map((e) => (
            <li key={e.id} className="pl-4">
              <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${STATUS_DOT[e.status]}`} />
              <div className="text-lime-400 text-xs font-semibold tabular-nums">
                {e.start_time ? `${hhmm(e.start_time)}${e.end_time ? `–${hhmm(e.end_time)}` : ''}` : t('cal.allDay')}
              </div>
              <Link href={hrefOf(e)} className="text-white font-medium hover:text-lime-400"><Kind e={e} />{e.title}</Link>
              <div className="text-gray-400 text-xs">
                {[e.location || '—', e.courts && `${e.courts} ${t('events.courts').toLowerCase()}`, e.kind && t(`kind.${e.kind}`), t(`events.status_${e.status}`)].filter(Boolean).join(' · ')}
              </div>
              {e.slots != null && (
                <div className="text-gray-300 text-xs">
                  {t('events.mainList')}: <Fill e={e} />
                  {Number(e.fee_amount) > 0 && ` · ${formatVnd(e.fee_amount)}`}
                </div>
              )}
              <DayActions e={e} onChanged={onChanged} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function EventCalendar({ view, date, events, onPickDay, onChanged }) {
  if (view === 'month') return <MonthView date={date} events={events} onPickDay={onPickDay} />;
  if (view === 'week') return <TimeGrid days={weekDays(date)} events={events} onPickDay={onPickDay} />;
  return <DayView date={date} events={events} onPickDay={onPickDay} onChanged={onChanged} />;
}
