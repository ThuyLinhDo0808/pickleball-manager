// Page title row shared by the redesigned sections: icon tile, title, a sub-line
// (usually the current club) and actions on the right.
// `hint`: a short guide shown as an (i) next to the title (instead of a separate line).
// `actionsWide`: actions only on wider screens (the phone has them elsewhere, e.g. the tabs).
export default function PageHeader({ icon, title, subtitle, actions, actionsWide = false, hint, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-3 sm:mb-4">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <span className="h-9 w-9 sm:h-11 sm:w-11 shrink-0 rounded-xl bg-lime-400/15 text-lime-300 flex items-center justify-center text-lg sm:text-xl" aria-hidden="true">{icon}</span>
        <div className="min-w-0">
          <h1 className="text-white text-xl sm:text-2xl font-bold leading-tight flex items-center gap-2 min-w-0"><span className="truncate">{title}</span>{hint}</h1>
          {subtitle && <p className="text-gray-400 text-sm truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className={`${actionsWide ? 'hidden sm:flex' : 'flex max-sm:w-full'} flex-wrap items-center justify-end gap-2`}>{actions}</div>}
      {children}
    </div>
  );
}
