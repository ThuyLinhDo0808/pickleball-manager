'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

const TONE = {
  warning: 'border-amber-300/60 bg-amber-300/10 text-amber-100',
  restored: 'border-lime-400/60 bg-lime-400/10 text-lime-100',
  removed: 'border-red-500/60 bg-red-500/10 text-red-100',
};
const ICON = { warning: '⚠️', restored: '✅', removed: '⛔' };
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '');

// Messages from clubs, shown on screen until the player taps "Đã hiểu": warned (and kept
// out of the club's events until a date), back in the club, or removed from it.
export default function PlayerNotices({ notices: initial = [] }) {
  const { t } = useI18n();
  const [notices, setNotices] = useState(initial);
  const ids = initial.map((n) => n.id).join(',');
  useEffect(() => setNotices(initial), [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!notices.length) return null;
  async function dismiss(n) {
    setNotices((x) => x.filter((y) => y.id !== n.id));
    await api.post(`/api/player/notices/${n.id}/read`, {}).catch(() => {});
  }
  return (
    <div className="flex flex-col gap-2 mb-4" role="status">
      {notices.map((n) => (
        <div key={n.id} className={`rounded-xl border px-4 py-3 ${TONE[n.kind]}`}>
          <p className="font-semibold">{ICON[n.kind]} {t(`notice.title_${n.kind}`, { club: n.club_name || '' })}</p>
          <p className="text-sm mt-1">
            {t(`notice.body_${n.kind}`, { club: n.club_name || '', reason: n.reason || '—', date: fmtDate(n.until) })}
            {n.kind === 'removed' && n.blocked ? ` ${t('notice.blocked')}` : ''}
          </p>
          <p className="text-xs opacity-70 mt-1">{fmtDate(n.created_at)}</p>
          <button type="button" className="mt-2 rounded-lg border border-current px-3 py-1 text-xs font-semibold" onClick={() => dismiss(n)}>{t('notice.ok')}</button>
        </div>
      ))}
    </div>
  );
}
