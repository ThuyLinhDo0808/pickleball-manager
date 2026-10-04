// Page title row shared by the redesigned sections: icon tile, title, a sub-line
// (usually the current club) and actions on the right.
export default function PageHeader({ icon, title, subtitle, actions, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className="h-11 w-11 shrink-0 rounded-xl bg-lime-400/15 text-lime-300 flex items-center justify-center text-xl" aria-hidden="true">{icon}</span>
        <div className="min-w-0">
          <h1 className="text-white text-2xl font-bold leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-gray-400 text-sm truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {children}
    </div>
  );
}
