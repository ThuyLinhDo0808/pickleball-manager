'use client';
import { useI18n } from '@/context/I18nContext';

// An empty block keeps its frame: one sentence saying why it is empty and, when there is
// one, the next step (`action`: a button or link, placed on the right).
export default function EmptyState({ title, children, action = null, className = '' }) {
  const { t } = useI18n();
  return (
    <div className={`rounded-card border border-dashed border-navy-600 px-4 py-5 flex flex-col sm:flex-row sm:items-center gap-3 ${className}`}>
      <div className="min-w-0 flex-1">
        <p className="text-gray-200 text-sm font-medium">{title || t('ui.nothingYet')}</p>
        {children && <div className="text-gray-400 text-sm mt-1">{children}</div>}
      </div>
      {action && <div className="flex justify-end shrink-0">{action}</div>}
    </div>
  );
}
