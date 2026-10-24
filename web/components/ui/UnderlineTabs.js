'use client';
import { useEffect, useRef } from 'react';
import UiIcon from '@/components/ui/UiIcon';

// In-page sub-tabs: one row of tabs with an underline under the chosen one (icon + word +
// optional count). Quieter than the page's main tabs (lime cells), so the two levels never
// look alike. On a phone the row scrolls sideways (the chosen tab is brought into view; a tab
// cut at the edge shows there is more); nothing wraps onto a second line.
export default function UnderlineTabs({ tabs, value, onChange, className = 'mb-4' }) {
  const row = useRef(null);
  useEffect(() => {
    // Sideways only (scrollIntoView could also move the page up or down).
    const box = row.current;
    const el = box?.querySelector('[aria-selected="true"]');
    if (el && box.scrollWidth > box.clientWidth) box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [value]);
  return (
    <div className={`relative ${className}`}>
      <div
        ref={row}
        role="tablist"
        className="flex gap-1 overflow-x-auto overscroll-x-contain border-b border-navy-700 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x"
      >
        {tabs.map(({ key, label, count, alert, icon }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(key)}
              className={`relative shrink-0 snap-start min-h-[44px] px-3 sm:px-3.5 text-sm whitespace-nowrap flex items-center gap-1.5 transition-colors ${active ? 'text-white font-semibold' : 'text-gray-400 hover:text-gray-100'}`}
            >
              {icon && <UiIcon name={icon} className={`w-4 h-4 ${active ? 'text-lime-300' : ''}`} />}
              {label}
              {count != null && <span className={`rounded-full px-1.5 min-w-[1.25rem] text-center text-xs tabular-nums ${active ? 'bg-lime-400/20 text-lime-200' : 'bg-navy-700 text-gray-300'}`}>{count}</span>}
              {alert > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-xs leading-5 tabular-nums text-center">{alert}</span>}
              <span className={`absolute left-2 right-2 -bottom-px h-0.5 rounded-full ${active ? 'bg-lime-400' : 'bg-transparent'}`} aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}
