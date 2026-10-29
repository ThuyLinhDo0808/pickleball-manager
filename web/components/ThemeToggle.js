'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import UiIcon from '@/components/ui/UiIcon';
import { useI18n } from '@/context/I18nContext';
import { readTheme, resolveTheme, saveTheme } from '@/lib/theme';

// Sáng / tối in one tap, next to the bell (the same choice as Cài đặt → Giao diện; "Theo
// thiết bị" stays there). Shows the theme you would switch to.
export default function ThemeToggle({ className = '' }) {
  const { t } = useI18n();
  const path = usePathname();
  const [now, setNow] = useState('dark');
  useEffect(() => {
    const sync = () => setNow(resolveTheme(readTheme(), window.location.pathname));
    sync();
    window.addEventListener('pb-theme', sync);
    return () => window.removeEventListener('pb-theme', sync);
  }, [path]);
  const next = now === 'light' ? 'dark' : 'light';
  const label = t(next === 'light' ? 'prof.toLight' : 'prof.toDark');
  return (
    <button
      type="button"
      onClick={() => saveTheme(next)}
      aria-label={label}
      title={label}
      className={`w-10 h-10 flex items-center justify-center rounded-lg bg-navy-800 text-gray-200 hover:bg-navy-700 transition-colors ${className}`}
    >
      <UiIcon name={next === 'light' ? 'sun' : 'moon'} className="w-5 h-5" />
    </button>
  );
}
