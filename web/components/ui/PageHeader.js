import UiIcon, { hasUiIcon } from '@/components/ui/UiIcon';

// Page title row shared by the redesigned sections: a plain line icon, the title (never cut
// off — long names wrap), a sub-line (usually the current club) and actions on the right.
// `icon`: a UiIcon name; anything else (old emoji) is not shown.
// `hint`: a short guide shown as an (i) next to the title (instead of a separate line).
// `actionsWide`: actions only on wider screens (the phone has them elsewhere, e.g. the tabs).
export default function PageHeader({ icon, title, subtitle, actions, actionsWide = false, hint, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-3 sm:mb-4">
      <div className="flex items-start gap-2.5 min-w-0">
        {hasUiIcon(icon) && <UiIcon name={icon} className="w-6 h-6 mt-0.5 sm:mt-1 text-gray-400" />}
        <div className="min-w-0">
          <h1 className="text-white text-xl sm:text-2xl font-bold leading-tight flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 break-words">
            <span className="min-w-0">{title}</span>
            {hint}
          </h1>
          {subtitle && <p className="text-gray-400 text-sm break-words mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className={`${actionsWide ? 'hidden sm:flex' : 'flex max-sm:w-full'} flex-wrap items-center justify-end gap-2`}>{actions}</div>}
      {children}
    </div>
  );
}
