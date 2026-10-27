// A row of mutually exclusive buttons (period, view mode…). The chosen one is a quiet
// navy step (the lime accent stays for main buttons); 44px tall on phones.
// phoneCols: on a phone, that many equal cells per row (e.g. 4 filters as 2×2) instead of
// pills that wrap unevenly; wider screens get one cell per item.
export default function Segmented({ items, value, onChange, label = (k) => k, className = '', full = false, phoneCols = 0 }) {
  const grid = full || phoneCols > 0;
  const cols = phoneCols > 0 ? `grid ${{ 2: 'grid-cols-2', 3: 'grid-cols-3' }[phoneCols] || 'grid-cols-2'} sm:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]` : full ? 'grid' : 'flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 sm:inline-flex sm:flex-wrap sm:overflow-visible';
  return (
    <div role="tablist" className={`${cols} gap-1 rounded-lg bg-navy-900 border border-navy-700 p-1 text-sm max-w-full ${className}`} style={phoneCols > 0 ? { '--n': items.length } : full ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` } : undefined}>
      {items.map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={value === k}
          onClick={() => onChange(k)}
          className={`min-h-[44px] sm:min-h-0 rounded-md px-2.5 py-1.5 ${grid ? 'leading-tight' : 'whitespace-nowrap flex-auto'} ${value === k ? 'bg-navy-700 text-white font-semibold' : 'text-gray-300 hover:text-white'}`}
        >
          {label(k)}
        </button>
      ))}
    </div>
  );
}
