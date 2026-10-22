'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';

// An explanation behind a small round "i": tapping it opens a pop-up, the page itself
// shows no extra text. `inline` puts the icon next to a title instead of on its own line.
export default function Hint({ text, title, className = '', inline = false }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const open_ = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };
  // On its own line the "i" says what it is ("Giải thích"), so nobody wonders what it does.
  const wide = (
    <button
      type="button"
      onClick={open_}
      className="relative inline-flex items-center gap-1 rounded-full border border-sky-300/30 px-2 py-0.5 text-sky-200/90 text-xs hover:bg-sky-300/10 hover:text-sky-100 transition-colors after:absolute after:-inset-2 after:content-['']"
    >
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-sky-300/60 text-[9px] font-bold leading-none" aria-hidden>i</span>
      {t('ui.helpTitle')}
    </button>
  );
  const button = (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      }}
      aria-label={t('ui.showHelp')}
      title={t('ui.showHelp')}
      className="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-sky-300/60 text-sky-300 text-[10px] font-bold leading-none hover:bg-sky-300/10 align-middle transition-colors after:absolute after:-inset-3 after:content-['']"
    >
      i
    </button>
  );
  return (
    <>
      {inline ? button : <div className={`mt-1.5 ${className}`}>{wide}</div>}
      <Modal open={open} title={title || t('ui.helpTitle')} onClose={() => setOpen(false)}>
        <p className="text-gray-200 text-base leading-relaxed whitespace-pre-line">{text}</p>
        <button type="button" className="btn-primary w-full mt-5" onClick={() => setOpen(false)}>
          {t('ui.gotIt')}
        </button>
      </Modal>
    </>
  );
}
