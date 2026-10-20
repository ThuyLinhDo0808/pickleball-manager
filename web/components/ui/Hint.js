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
      {inline ? button : <div className={className}>{button}</div>}
      <Modal open={open} title={title || t('ui.helpTitle')} onClose={() => setOpen(false)}>
        <p className="text-gray-200 text-base leading-relaxed whitespace-pre-line">{text}</p>
        <button type="button" className="btn-primary w-full mt-5" onClick={() => setOpen(false)}>
          {t('ui.gotIt')}
        </button>
      </Modal>
    </>
  );
}
