// In-page tabs drawn like the section tabs (underline), with an optional count badge.
export default function UnderlineTabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="-mx-4 px-4 md:mx-0 md:px-0 mb-4 overflow-x-auto overflow-y-hidden no-scrollbar border-b border-navy-700">
      <div className="flex gap-1 min-w-max">
        {tabs.map(({ key, label, count, alert, icon }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(key)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm whitespace-nowrap flex items-center gap-1.5 transition ${active ? 'border-lime-400 text-lime-300 font-semibold' : 'border-transparent text-gray-400 hover:text-white hover:border-navy-500'}`}
            >
              {icon && <span aria-hidden="true">{icon}</span>}
              {label}
              {count != null && <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-lime-400/20 text-lime-200' : 'bg-navy-700 text-gray-300'}`}>{count}</span>}
              {alert > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-xs leading-5 text-center">{alert}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
