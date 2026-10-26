'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Cloudflare Turnstile bot check. Shown only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set;
// usually invisible (it appears only if Cloudflare is unsure). `onToken(token|'')`.
// ref.reset() after each try: a token works once.
export const CAPTCHA_ON = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading = null;
function loadScript() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SRC;
      s.async = true;
      s.onload = () => resolve(window.turnstile);
      s.onerror = () => {
        loading = null;
        reject(new Error('captcha script'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const Captcha = forwardRef(function Captcha({ onToken, className = '' }, ref) {
  const box = useRef(null);
  const id = useRef(null);
  useImperativeHandle(ref, () => ({
    reset() {
      onToken?.('');
      if (id.current != null) window.turnstile?.reset(id.current);
    },
  }));
  useEffect(() => {
    if (!CAPTCHA_ON) return undefined;
    let gone = false;
    loadScript()
      .then((ts) => {
        if (gone || !ts || !box.current) return;
        id.current = ts.render(box.current, {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          theme: 'dark',
          language: document.documentElement.lang || 'vi',
          callback: (tok) => onToken?.(tok),
          'expired-callback': () => onToken?.(''),
          'error-callback': () => onToken?.(''),
        });
      })
      .catch(() => onToken?.(''));
    return () => {
      gone = true;
      if (id.current != null) window.turnstile?.remove(id.current);
      id.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!CAPTCHA_ON) return null;
  return <div ref={box} className={className} />;
});

export default Captcha;
