'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { TEXT_SIZES, readTextSize, saveTextSize } from '@/lib/textSize';
import Modal from '@/components/Modal';

// "Cỡ chữ: A · A+ · A++" — three big buttons, for people who find the text too small.
export default function TextSizeSwitch({ className = '', showLabel = true }) {
  const { t } = useI18n();
  const [size, setSize] = useState('normal');
  useEffect(() => setSize(readTextSize()), []);
  return (
    <div className={className} role="group" aria-label={t('ux.textSize')}>
      {showLabel && <p className="text-gray-300 text-sm mb-1">🔠 {t('ux.textSize')}</p>}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-navy-950 border border-navy-700 p-1">
        {TEXT_SIZES.map((s, i) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={size === s.key}
            aria-label={t(`ux.textSize_${s.key}`)}
            title={t(`ux.textSize_${s.key}`)}
            onClick={() => {
              setSize(s.key);
              saveTextSize(s.key);
            }}
            className={`rounded-md py-1.5 font-bold leading-none ${size === s.key ? 'bg-lime-400 text-navy-950' : 'text-gray-200 hover:bg-navy-800'}`}
            style={{ fontSize: `${0.9 + i * 0.2}rem` }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// A small "Aa" button for top bars: opens the three sizes in a pop-up.
export function TextSizeButton({ className = '' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('ux.textSize')}
        title={t('ux.textSize')}
        className={`shrink-0 h-9 min-w-[2.25rem] px-2 flex items-center justify-center rounded-lg bg-navy-800 border border-navy-700 text-gray-100 font-bold hover:border-lime-400 ${className}`}
      >
        <span className="text-sm leading-none">A</span><span className="text-lg leading-none">a</span>
      </button>
      <Modal open={open} title={`🔠 ${t('ux.textSize')}`} onClose={() => setOpen(false)}>
        <p className="text-gray-300 mb-3">{t('ux.textSizeHint')}</p>
        <TextSizeSwitch showLabel={false} />
        <button type="button" className="btn-primary w-full mt-5" onClick={() => setOpen(false)}>{t('ui.gotIt')}</button>
      </Modal>
    </>
  );
}
