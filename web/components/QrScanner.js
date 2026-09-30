'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/context/I18nContext';

// Continuous camera QR scanner (back camera). Calls onScan(text) for each new code;
// the same code is ignored for a few seconds so one player isn't checked in twice.
// Falls back to typing / pasting the code when the camera isn't available.
export default function QrScanner({ onScan, paused = false }) {
  const { t } = useI18n();
  const video = useRef(null);
  const canvas = useRef(null);
  const last = useRef({ text: '', at: 0 });
  const pausedRef = useRef(paused);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  pausedRef.current = paused;

  useEffect(() => {
    let stream;
    let raf;
    let stopped = false;
    let jsQR;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(window.isSecureContext ? t('qr.noCamera') : t('qr.needHttps'));
        return;
      }
      try {
        jsQR = (await import('jsqr')).default;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) return stream.getTracks().forEach((tr) => tr.stop());
        video.current.srcObject = stream;
        await video.current.play();
        tick();
      } catch (err) {
        setError(err?.name === 'NotAllowedError' ? t('qr.denied') : t('qr.noCamera'));
      }
    }

    function tick() {
      if (stopped) return;
      const v = video.current;
      const c = canvas.current;
      if (v && c && v.readyState >= 2 && !pausedRef.current) {
        const scale = Math.min(1, 640 / (v.videoWidth || 640));
        c.width = Math.round(v.videoWidth * scale);
        c.height = Math.round(v.videoHeight * scale);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        const now = Date.now();
        if (code?.data && !(code.data === last.current.text && now - last.current.at < 4000)) {
          last.current = { text: code.data, at: now };
          navigator.vibrate?.(60);
          onScan(code.data);
        }
      }
      raf = requestAnimationFrame(tick);
    }

    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {!error && (
        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-black">
          <video ref={video} playsInline muted className="h-full w-full object-cover" />
          {/* aiming frame */}
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-lime-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          {paused && <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-sm">…</div>}
        </div>
      )}
      {error && <p className="card text-yellow-300 text-sm">{error}</p>}
      <canvas ref={canvas} className="hidden" />
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onScan(manual.trim());
          setManual('');
        }}
      >
        <input className="input text-sm" placeholder={t('qr.manualPh')} value={manual} onChange={(e) => setManual(e.target.value)} />
        <button className="btn-secondary text-sm shrink-0">{t('qr.check')}</button>
      </form>
    </div>
  );
}
