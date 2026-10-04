// A row of mutually exclusive buttons (period, view mode…).
export default function Segmented({ items, value, onChange, label = (k) => k, className = '', full = false }) {
  return (
    <div role="tablist" className={`${full ? 'grid' : 'inline-flex flex-wrap'} gap-1 rounded-lg bg-navy-900 border border-navy-700 p-1 text-sm max-w-full ${className}`} style={full ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` } : undefined}>
      {items.map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={value === k}
          onClick={() => onChange(k)}
          className={`whitespace-nowrap rounded-md px-2.5 py-1.5 truncate ${full ? '' : 'flex-auto'} ${value === k ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-300 hover:text-white'}`}
        >
          {label(k)}
        </button>
      ))}
    </div>
  );
}
