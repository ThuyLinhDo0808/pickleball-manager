'use client';
import { useI18n } from '@/context/I18nContext';

// Language picker, the same box in every shell (manager sidebar, player top bar, owner).
export default function LangSelect({ className = '' }) {
  const { lang, setLang, t } = useI18n();
  return (
    <select aria-label={t('nav.language')} value={lang} onChange={(e) => setLang(e.target.value)} className={`input text-sm !w-auto ${className}`}>
      <option value="vi">Tiếng Việt</option>
      <option value="en">English</option>
    </select>
  );
}
