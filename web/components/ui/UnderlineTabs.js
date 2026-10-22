import UiIcon from '@/components/ui/UiIcon';

// In-page tabs drawn like the section tabs (round chips that wrap onto a second line on a
// phone, so no tab hides off the edge of the screen), with an optional count badge.
export default function UnderlineTabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="mb-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map(({ key, label, count, alert, icon }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(key)}
              className={`min-h-[44px] sm:min-h-0 rounded-full border px-3.5 py-2 text-sm whitespace-nowrap flex items-center gap-1.5 transition ${active ? 'border-lime-400/60 bg-lime-400/10 text-lime-300 font-semibold' : 'border-navy-600 text-gray-200 hover:border-lime-400 hover:text-white'}`}
            >
              {icon && <UiIcon name={icon} className="w-4 h-4" />}
              {label}
              {count != null && <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-lime-400/20 text-lime-200' : 'bg-navy-700 text-gray-300'}`}>{count}</span>}
              {alert > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-xs leading-5 tabular-nums text-center">{alert}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
