'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';

// A long explanation, folded: a small "ⓘ" opens it. Pages stay short; help is one tap away.
export default function Hint({ text, className = '' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200 py-0.5">
        <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-sky-300/70 text-[10px] font-bold">i</span>
        {open ? t('ui.hideHelp') : t('ui.showHelp')}
      </button>
      {open && <p className="text-gray-300 text-sm mt-1 leading-relaxed">{text}</p>}
    </div>
  );
}
