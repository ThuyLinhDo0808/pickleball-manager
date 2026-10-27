'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import ChipRow from '@/components/ui/ChipRow';

export const FEEDBACK_CATEGORIES = ['bug', 'ux', 'idea', 'billing', 'privacy'];
const MIN = 10;

// What the device is, so a bug can be reproduced: browser + OS (from the user agent), the
// window size and the language. Nothing that identifies the person.
function deviceInfo() {
  if (typeof window === 'undefined') return '';
  const ua = navigator.userAgent || '';
  // First match wins (Edge / Opera / Samsung also say "Chrome"; Safari says "Version").
  const name = ['Edg', 'OPR', 'SamsungBrowser', 'CriOS', 'FxiOS', 'Firefox', 'Chrome', 'Version'].find((n) => ua.includes(`${n}/`));
  const browser = name ? `${name === 'Version' ? 'Safari' : name} ${(new RegExp(`${name}/(\\d+)`).exec(ua) || [])[1] || ''}`.trim() : '';
  const os = /iPhone|iPad/.test(ua) ? `iOS ${(/OS (\d+)/.exec(ua) || [])[1] || ''}` : /Android (\d+)/.test(ua) ? `Android ${/Android (\d+)/.exec(ua)[1]}` : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const screen = `${window.innerWidth}×${window.innerHeight}@${window.devicePixelRatio || 1}x`;
  return [browser, os.trim(), screen, navigator.language].filter(Boolean).join(' · ').slice(0, 300);
}

// "Báo lỗi" — a message to the Ban quản trị (Owner → Báo lỗi / Liên hệ inbox, and emailed
// when configured). Not for rating a session: that is the after-session review.
// `onClose`: shown as a button after sending (in a pop-up); on a page, "Gửi thêm" instead.
export function FeedbackForm({ onClose = null }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const pathname = usePathname() || '';
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function send(e) {
    e.preventDefault();
    if (!category) return setError(t('feedback.pickCategory'));
    if (message.trim().length < MIN) return setError(t('feedback.tooShort', { n: MIN }));
    setBusy(true);
    setError('');
    try {
      await api.post('/api/host/feedback', { category, message, contact: user?.email, page: pathname, device: deviceInfo() });
      setMessage('');
      setCategory('');
      setSent(true);
    } catch (err) {
      const c = err.payload?.code;
      setError(c === 'feedback_daily_limit' ? t('feedback.dailyLimit') : c === 'feedback_blocked' ? t('feedback.blocked') : c === 'too_short' ? t('feedback.tooShort', { n: MIN }) : err.message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center py-6">
        <div className="text-5xl mb-3"></div>
        <p className="text-white text-lg font-semibold">{t('feedback.thanksTitle')}</p>
        <p className="text-gray-300 text-sm mt-1">{t('feedback.thanks')}</p>
        {onClose ? (
          <button className="btn-primary mt-5 w-full sm:w-auto sm:px-10" onClick={() => { setSent(false); onClose(); }}>{t('feedback.close')}</button>
        ) : (
          <button type="button" className="btn-secondary mt-5 w-full sm:w-auto sm:px-10" onClick={() => setSent(false)}>{t('feedback.again')}</button>
        )}
      </div>
    );
  }
  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      <p className="text-gray-400 text-sm">{t('feedback.hint')}</p>
      <fieldset>
        <legend className="text-xs text-gray-400 mb-1">{t('feedback.category')} <span className="text-lime-400">*</span></legend>
        <ChipRow gap="gap-1.5" role="radiogroup">
          {FEEDBACK_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={category === c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1.5 text-sm border ${category === c ? 'border-lime-400 bg-lime-400 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}
            >
              {t(`feedback.cat_${c}`)}
            </button>
          ))}
        </ChipRow>
      </fieldset>
      <div>
        <label htmlFor="feedback-message" className="text-xs text-gray-400">{t('feedback.message')}</label>
        <textarea id="feedback-message" className="input" rows={5} required minLength={MIN} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />
        <p className="text-[11px] text-gray-500 mt-1">{t('feedback.attached')}</p>
      </div>
      {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}
      <div className="flex justify-end">
        <button className="btn-primary max-sm:w-full sm:px-8" disabled={busy || !message.trim()}>{t('feedback.send')}</button>
      </div>
    </form>
  );
}

// The same form in a pop-up (player pages).
export default function FeedbackButton({ className = '', children }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} title={t('feedback.button')}>
        {children || t('feedback.button')}
      </button>
      <Modal open={open} title={t('feedback.title')} onClose={() => setOpen(false)}>
        <FeedbackForm onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}
