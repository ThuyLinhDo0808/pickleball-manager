'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';

// Unknown address. A confirmation link built from a bad site URL (e.g. "/**/welcome")
// still carries the result in its hash: send it on to the real welcome page.
export default function NotFound() {
  const { t } = useI18n();
  const [lost, setLost] = useState(false);

  useEffect(() => {
    const { pathname, search, hash } = window.location;
    if (/\/welcome\/?$/.test(pathname) && pathname !== '/welcome') {
      window.location.replace(`/welcome${search}${hash}`);
      return;
    }
    setLost(true);
  }, []);

  if (!lost) return <div className="min-h-screen bg-navy-950" />;
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-navy-950 px-6 text-center">
      <div className="text-5xl" aria-hidden="true">🏓</div>
      <p className="text-white text-lg font-semibold">{t('notFound.title')}</p>
      <Link href="/" className="btn-primary">{t('notFound.home')}</Link>
    </div>
  );
}
