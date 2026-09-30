'use client';
import { useI18n } from '@/context/I18nContext';
import DatePopover from '@/components/DatePopover';
import { addDays, addMonths, monthGrid, monthStart, monthTitle, todayYmd, weekday, weekdayLabels } from '@/lib/dates';

export const MAX_SESSIONS = 200;

export const blankWeekly = () => {
  const from = todayYmd();
  return { weekdays: [], from, to: addDays(addMonths(from, 2), -1), added: [], removed: [] };
};

// Every chosen weekday between `from` and `to`, plus days ticked by hand, minus days unticked.
export function weeklyDates({ weekdays, from, to, added, removed }) {
  const out = new Set();
  if (from && to && to >= from) {
    for (let d = from, i = 0; d <= to && i < 800; d = addDays(d, 1), i++) {
      if (weekdays.includes(weekday(d))) out.add(d);
    }
  }
  for (const d of added) out.add(d);
  for (const d of removed) out.delete(d);
  return [...out].sort();
}

// Weekly schedule picker: tick the weekdays (e.g. T3, T5, T7) and a date range; the months
// below show every session, and clicking a day adds or removes that one session.
export default function WeeklyDates({ value, onChange }) {
  const { t, lang } = useI18n();
  const set = (patch) => onChange({ ...value, ...patch });
  const dates = weeklyDates(value);
  const chosen = new Set(dates);
  const today = todayYmd();

  function toggleWeekday(i) {
    set({ weekdays: value.weekdays.includes(i) ? value.weekdays.filter((x) => x !== i) : [...value.weekdays, i].sort() });
  }

  function toggleDay(d) {
    const inRule = value.from <= d && d <= value.to && value.weekdays.includes(weekday(d));
    if (chosen.has(d)) {
      set(inRule ? { removed: [...value.removed, d] } : { added: value.added.filter((x) => x !== d) });
    } else {
      set(inRule ? { removed: value.removed.filter((x) => x !== d) } : { added: [...value.added, d] });
    }
  }

  // Months to show: the whole range (at most 12), plus any hand-picked day outside it.
  const first = monthStart(dates[0] && dates[0] < value.from ? dates[0] : value.from || today);
  const lastDay = [value.to, dates[dates.length - 1]].filter(Boolean).sort().pop() || first;
  const months = [];
  for (let m = first; m <= lastDay && months.length < 12; m = addMonths(m, 1)) months.push(m);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs text-gray-400">{t('weekly.days')}</label>
        <div className="grid grid-cols-7 gap-1 mt-1">
          {weekdayLabels(lang).map((w, i) => (
            <button
              key={w}
              type="button"
              aria-pressed={value.weekdays.includes(i)}
              onClick={() => toggleWeekday(i)}
              className={`rounded-lg border py-2 text-sm font-semibold ${value.weekdays.includes(i) ? 'border-lime-400 bg-lime-400 text-navy-950' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400">{t('weekly.from')}</label>
          <DatePopover value={value.from} onChange={(d) => set({ from: d, to: value.to < d ? d : value.to })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('weekly.to')}</label>
          <DatePopover align="right" value={value.to} onChange={(d) => set({ to: d })} />
        </div>
      </div>

      <p className={`text-sm ${dates.length > MAX_SESSIONS ? 'text-red-400' : 'text-lime-400'}`}>
        {dates.length > MAX_SESSIONS ? t('weekly.tooMany', { max: MAX_SESSIONS }) : t('weekly.count', { n: dates.length })}
        <span className="text-gray-500 text-xs block">{t('weekly.clickHint')}</span>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {months.map((m) => (
          <div key={m} className="rounded-lg border border-navy-700 bg-navy-900 p-2">
            <div className="text-white text-sm font-semibold capitalize mb-1">{monthTitle(m, lang)}</div>
            <div className="grid grid-cols-7 text-center text-[10px] text-gray-500 mb-0.5">
              {weekdayLabels(lang).map((w) => <span key={w}>{w}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {monthGrid(m).map((d) => {
                const other = d.slice(0, 7) !== m.slice(0, 7);
                if (other) return <span key={d} />;
                const on = chosen.has(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(d)}
                    className={`h-8 rounded text-xs tabular-nums ${on ? 'bg-lime-400 text-navy-950 font-bold' : d < today ? 'text-gray-600 hover:bg-navy-700' : 'text-gray-300 hover:bg-navy-700'} ${d === today && !on ? 'ring-1 ring-lime-400/60' : ''}`}
                  >
                    {Number(d.slice(8))}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
