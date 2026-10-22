'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';

// A step-by-step guide in a pop-up: one step at a time (picture + short text), with
// Trước / Tiếp tục and Đóng. `steps`: [{ title, body, image? }]. A picture that is not
// there yet (no file in /public) is simply left out.
export default function GuideModal({ open, title, steps = [], onClose, footer = null }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [missing, setMissing] = useState({});
  useEffect(() => {
    if (open) setI(0);
  }, [open]);
  const step = steps[i] || {};
  const last = i >= steps.length - 1;
  return (
    <Modal open={open} title={title} onClose={onClose}>
      {steps.length > 1 && (
        <div className="flex items-center gap-1.5 mb-3" aria-hidden>
          {steps.map((_, n) => (
            <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= i ? 'bg-lime-400' : 'bg-navy-600'}`} />
          ))}
        </div>
      )}
      {steps.length > 1 && <p className="text-sm text-gray-400 tabular-nums">{t('guide.stepOf', { n: i + 1, total: steps.length })}</p>}
      {step.title && <p className="text-white font-semibold mt-1">{step.title}</p>}
      {step.image && !missing[step.image] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={step.image} alt={step.title || ''} className="mt-3 w-full rounded-xl border border-navy-600" onError={() => setMissing((m) => ({ ...m, [step.image]: true }))} />
      )}
      {step.body && <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line mt-2">{step.body}</p>}
      {last && footer}
      <div className="dialog-actions">
        {i > 0 ? (
          <button type="button" className="btn-secondary" onClick={() => setI(i - 1)}>{t('guide.prev')}</button>
        ) : (
          <button type="button" className="btn-secondary" onClick={onClose}>{t('guide.close')}</button>
        )}
        {last ? (
          <button type="button" className="btn-primary" onClick={onClose}>{t('ui.gotIt')}</button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => setI(i + 1)}>{t('guide.next')}</button>
        )}
      </div>
    </Modal>
  );
}
