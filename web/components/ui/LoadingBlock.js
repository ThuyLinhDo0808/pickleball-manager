'use client';
import { useI18n } from '@/context/I18nContext';

// Loading: flat grey bars where the rows will be (no shimmer), so nothing jumps when the
// data lands. `rows`: how many lines to hold; `label`: read out by screen readers.
export default function LoadingBlock({ rows = 3, label, className = '' }) {
  const { t } = useI18n();
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-live="polite">
      <span className="sr-only">{label || t('ui.loading')}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3" aria-hidden="true">
          <div className="h-4 rounded bg-navy-700" style={{ width: `${[62, 48, 55, 40, 58][i % 5]}%` }} />
          <div className="ml-auto h-4 w-14 rounded bg-navy-700" />
        </div>
      ))}
    </div>
  );
}
