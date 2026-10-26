'use client';
import Link from 'next/link';
import UiIcon from '@/components/ui/UiIcon';

// A row of 2–4 equal action buttons (the things a Host does every day on a page).
// Phone: one grid row, every cell the same size — icon on top, the word underneath in a
// box that always has room for two lines, so a long label and a short one sit at the same
// height (no cell taller than its neighbours, no text jumping up or down).
// Wider screens: ordinary pills on the right, the main one last.
// actions: [{ key, label, icon, href | onClick, primary, disabled }]
export default function ActionRow({ actions, className = '' }) {
  const list = actions.filter(Boolean);
  const cols = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[Math.min(Math.max(list.length, 2), 4)];
  return (
    <div className={`grid ${cols} gap-2 sm:flex sm:flex-wrap sm:justify-end ${className}`}>
      {list.map(({ key, label, icon, href, onClick, primary, disabled }) => {
        const cls = `${primary ? 'btn-primary' : 'btn-secondary'} h-full min-h-[4.25rem] sm:min-h-0 !px-1.5 sm:!px-4 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center`;
        const body = (
          <>
            <UiIcon name={icon} className="w-5 h-5 sm:w-4 sm:h-4 shrink-0" />
            <span className="flex h-8 sm:h-auto items-center justify-center text-xs sm:text-sm leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden sm:[display:inline] sm:whitespace-nowrap">{label}</span>
          </>
        );
        return href ? (
          <Link key={key || href} href={href} className={cls} aria-disabled={disabled || undefined}>
            {body}
          </Link>
        ) : (
          <button key={key || label} type="button" className={cls} onClick={onClick} disabled={disabled}>
            {body}
          </button>
        );
      })}
    </div>
  );
}
