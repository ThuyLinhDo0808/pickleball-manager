'use client';
import { useI18n } from '@/context/I18nContext';
import UiIcon from '@/components/ui/UiIcon';

// An error inside the block that failed (never a full-screen banner): what failed, and a
// Retry button on the right when `onRetry` is given.
export default function ErrorBlock({ message, onRetry, className = '' }) {
  const { t } = useI18n();
  return (
    <div className={`rounded-card bg-bad-bg px-4 py-3 flex items-center gap-3 ${className}`} role="alert">
      <UiIcon name="alert" className="w-4 h-4 text-bad-fg" />
      <p className="text-gray-100 text-sm flex-1 min-w-0 break-words">{message || t('ui.loadFailed')}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary !min-h-[2.75rem] sm:!min-h-[2.25rem] shrink-0">
          {t('ui.retry')}
        </button>
      )}
    </div>
  );
}
