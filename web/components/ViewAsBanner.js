'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { viewingAs, stopViewAs } from '@/lib/api';

// While the owner views the app as a Host: a bar on every page saying so, with a way
// out. Any attempt to change something flashes "read-only" (lib/api.js refuses it and
// so does the server).
export default function ViewAsBanner() {
  const { t } = useI18n();
  const [as, setAs] = useState(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    setAs(viewingAs());
    let timer;
    const on = () => { setFlash(true); clearTimeout(timer); timer = setTimeout(() => setFlash(false), 2500); };
    window.addEventListener('pb:read-only', on);
    return () => { window.removeEventListener('pb:read-only', on); clearTimeout(timer); };
  }, []);
  if (!as) return null;
  const exit = () => {
    stopViewAs();
    window.location.href = `/owner/hosts/${as.id}`;
  };
  return (
    <div className="sticky top-0 z-[60] bg-amber-300 text-navy-950 text-sm px-3 py-1.5 flex items-center gap-2 justify-center flex-wrap" role="status">
      <span className="font-semibold">👁 {t('owner.viewingAs', { email: as.email })}</span>
      {flash && <span className="rounded bg-navy-950 text-amber-200 px-2 py-0.5 text-xs">{t('owner.readOnlyBlocked')}</span>}
      <button type="button" onClick={exit} className="rounded-full bg-navy-950 text-white px-3 py-0.5 text-xs font-semibold">✕ {t('owner.exitViewAs')}</button>
    </div>
  );
}
