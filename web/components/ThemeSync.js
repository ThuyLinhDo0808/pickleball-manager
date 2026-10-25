'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { applyTheme, readTheme } from '@/lib/theme';

// Keeps html[data-theme] right when moving between pages (the landing page and sign-in
// are always dark) and when the device switches light / dark under "Theo thiết bị".
export default function ThemeSync() {
  const path = usePathname();
  useEffect(() => {
    applyTheme(readTheme(), path);
  }, [path]);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    const on = () => readTheme() === 'system' && applyTheme();
    mq?.addEventListener?.('change', on);
    return () => mq?.removeEventListener?.('change', on);
  }, []);
  return null;
}
