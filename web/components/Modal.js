'use client';
import { useEffect } from 'react';

// Bottom sheet on phones, centered dialog on larger screens. Esc / backdrop closes.
export default function Modal({ open, title, onClose, children }) {
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <button aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-navy-800 border border-navy-700 rounded-t-2xl sm:rounded-2xl p-5 pb-safe-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-lg font-semibold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none px-2">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
