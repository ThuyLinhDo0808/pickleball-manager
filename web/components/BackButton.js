'use client';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';
import { PREV_KEY } from '@/components/NavTracker';

// "← Quay lại": the previous page when the visitor came from inside the site, else `fallback`
// (opened from a shared link, a new tab or a bookmark).
export default function BackButton({ fallback = '/home', label, className = '' }) {
  const { t } = useI18n();
  const router = useRouter();
  const go = () => {
    let prev = null;
    try {
      prev = sessionStorage.getItem(PREV_KEY);
    } catch {}
    if (prev && window.history.length > 1) router.back();
    else router.push(fallback);
  };
  return (
    <button type="button" onClick={go} className={`inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-3 ${className}`}>
      <span aria-hidden="true">←</span>
      {label || t('common.goBack')}
    </button>
  );
}
