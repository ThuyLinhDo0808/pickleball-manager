'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import UiIcon from '@/components/ui/UiIcon';

// Bottom sheet on phones, centered dialog on larger screens. Esc / backdrop closes.
// Rendered into <body> so it always sits above the page, even when opened from the
// sticky sidebar (whose stacking context would otherwise let page content cover it).
// `footer`: the dialog's buttons, laid out secondary-left / primary-right (stacked on phones,
// primary on top) — pass them in that order: secondary first, primary last.
export default function Modal({ open, title, onClose, children, footer = null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <button aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-navy-800 border border-navy-700 rounded-t-sheet sm:rounded-sheet p-5 pb-safe-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-white text-lg font-semibold leading-snug pt-2 break-words min-w-0">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="-mr-2 -mt-1 h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-control text-gray-400 hover:text-white hover:bg-navy-700">
            <UiIcon name="x" className="w-5 h-5" />
          </button>
        </div>
        {children}
        {footer && <div className="dialog-actions">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
