// A small KPI tile: label + icon on top, a big number, an optional sub-line.
// `active` highlights it when it doubles as a filter button.
export default function StatTile({ icon, label, value, sub, tone = 'text-white', onClick, active = false }) {
  const cls = `card !p-3.5 h-full text-left flex flex-col gap-0.5 transition ${onClick ? 'hover:border-navy-500 cursor-pointer' : ''} ${active ? '!border-lime-400 bg-lime-400/5' : ''}`;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2 text-gray-400 text-[11px] font-semibold uppercase tracking-wide">
        <span className="leading-tight">{label}</span>
        <span className="text-base" aria-hidden="true">{icon}</span>
      </div>
      <div className={`text-xl sm:text-2xl font-bold tabular-nums whitespace-nowrap ${tone}`}>{value}</div>
      {sub && <div className="text-gray-400 text-xs truncate">{sub}</div>}
    </>
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-pressed={active}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
