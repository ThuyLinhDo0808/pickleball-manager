'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { addMonths, formatDay, monthGrid, monthTitle, todayYmd, weekdayLabels } from '@/lib/dates';

// A small month calendar: inline, or behind a button as a popover.
// `marks` = { 'YYYY-MM-DD': count } shows a dot under days that have events.
export function MiniCalendar({ value, onChange, marks = {} }) {
  const { lang } = useI18n();
  const [cursor, setCursor] = useState(value || todayYmd());
  useEffect(() => {
    if (value) setCursor(value);
  }, [value]);
  const today = todayYmd();
  const month = cursor.slice(0, 7);

  return (
    <div className="w-72 max-w-full select-none">
      <div className="flex items-center justify-between mb-2">
        <button type="button" className="h-8 w-8 rounded-lg hover:bg-navy-700 text-gray-300" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="‹">‹</button>
        <span className="text-white text-sm font-semibold capitalize">{monthTitle(cursor, lang)}</span>
        <button type="button" className="h-8 w-8 rounded-lg hover:bg-navy-700 text-gray-300" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="›">›</button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-gray-500 mb-1">
        {weekdayLabels(lang).map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {monthGrid(cursor).map((d) => {
          const selected = d === value;
          const other = d.slice(0, 7) !== month;
          return (
            <button
              type="button"
              key={d}
              onClick={() => onChange(d)}
              title={formatDay(d, lang, { weekday: 'long', day: 'numeric', month: 'long' })}
              className={`relative h-9 rounded-lg text-sm tabular-nums transition ${
                selected ? 'bg-lime-400 text-navy-950 font-bold' : d === today ? 'ring-1 ring-lime-400 text-white' : other ? 'text-gray-600 hover:bg-navy-800' : 'text-gray-200 hover:bg-navy-700'
              }`}
            >
              {Number(d.slice(8))}
              {marks[d] > 0 && <span className={`absolute left-1/2 -translate-x-1/2 bottom-1 h-1 w-1 rounded-full ${selected ? 'bg-navy-950' : 'bg-lime-400'}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DatePopover({ value, onChange, marks, placeholder = '—', className = '', align = 'left' }) {
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className={`relative ${className}`} ref={box}>
      <button type="button" className="input text-left flex items-center gap-2 whitespace-nowrap" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span aria-hidden>📅</span>
        <span className={value ? 'text-white' : 'text-gray-500'}>{value ? formatDay(value, lang, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : placeholder}</span>
      </button>
      {open && (
        <div className={`absolute z-40 mt-2 rounded-xl border border-navy-600 bg-navy-900 p-3 shadow-2xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <MiniCalendar
            value={value}
            marks={marks}
            onChange={(d) => {
              onChange(d);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
