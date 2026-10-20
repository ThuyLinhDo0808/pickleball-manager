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
      className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/50 px-2.5 py-1 text-sky-200 text-sm hover:bg-sky-300/10"
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-sky-300/70 text-xs font-bold" aria-hidden>i</span>
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
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-sky-300/70 text-sky-300 text-xs font-bold hover:bg-sky-300/10 align-middle"
    >
      i
    </button>
  );
  return (
    <>
      {inline ? button : <div className={`mt-1 ${className}`}>{wide}</div>}
      <Modal open={open} title={title || t('ui.helpTitle')} onClose={() => setOpen(false)}>
        <p className="text-gray-200 text-base leading-relaxed whitespace-pre-line">{text}</p>
        <button type="button" className="btn-primary w-full mt-5" onClick={() => setOpen(false)}>
          {t('ui.gotIt')}
        </button>
      </Modal>
    </>
  );
}
