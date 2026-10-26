import Hint from '@/components/ui/Hint';
// A small KPI tile: a label, the number, an optional sub-line. No icon (KPIs are type, not
// pictures); `icon` is still accepted from old callers and ignored.
// `active` highlights it when it doubles as a filter button. `hint`: an (i) pop-up next to
// the label explaining how the number is counted (not on clickable tiles).

export default function StatTile({ label, value, sub, tone = 'text-white', onClick, active = false, hint = null }) {
  const cls = `card !p-3.5 h-full text-left flex flex-col gap-0.5 transition ${onClick ? 'hover:border-navy-600 cursor-pointer' : ''} ${active ? '!border-lime-400/60 bg-lime-400/5' : ''}`;
  const body = (
    <>
      <div className="text-gray-300 text-sm leading-snug">{label}{hint && !onClick && <> <Hint inline text={hint} /></>}</div>
      <div className={`text-xl sm:text-2xl font-bold tabular-nums break-words ${tone}`}>{value}</div>
      {sub && <div className="text-gray-400 text-xs sm:text-sm break-words">{sub}</div>}
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
