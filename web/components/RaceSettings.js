'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import UiIcon from '@/components/ui/UiIcon';

const REWARDS = ['free', 'half', 'none'];

// Cuộc đua Top tháng settings (on / off, prizes, minimum sessions, voucher validity), kept in
// the community's Bảng điều khiển. Each change saves at once.
export default function RaceSettings({ club, canEdit }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { data: d, error, reload } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/race`) : Promise.resolve(null)), [club?.id]);
  const s = d?.settings;
  if (error || !s) return null; // before the race migration: nothing to set

  const save = async (patch) => {
    setBusy(true);
    setErr('');
    try {
      await api.patch(`/api/clubs/${club.id}/race`, patch);
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="card mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-white font-semibold flex items-center gap-2"><UiIcon name="trophy" className="w-5 h-5 text-gray-400" />{t('race.title')}</h2>
            <p className="text-gray-400 text-xs mt-0.5">{t('race.rules', { min: s.min_sessions, day: s.join_by_day })}</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
            <input type="checkbox" checked={s.enabled} disabled={!canEdit || busy} onChange={(e) => save({ enabled: e.target.checked })} />
            {s.enabled ? t('race.on') : t('race.off')}
          </label>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          {['1', '2', '3'].map((r) => (
            <label key={r} className="text-sm">
              <span className="text-xs text-gray-400">{t('race.prizeFor', { n: r })}</span>
              <select className="input mt-1" value={s.rewards[r]} disabled={!canEdit || busy} onChange={(e) => save({ rewards: { ...s.rewards, [r]: e.target.value } })}>
                {REWARDS.map((k) => <option key={k} value={k}>{t(`race.reward_${k}`)}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4 mt-3 text-sm">
          <label>
            <span className="text-xs text-gray-400">{t('race.minSessions')}</span>
            <select className="input mt-1 !w-40" value={s.min_sessions} disabled={!canEdit || busy} onChange={(e) => save({ min_sessions: Number(e.target.value) })}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{t('race.minSessionsN', { n })}</option>)}
            </select>
          </label>
          <label>
            <span className="text-xs text-gray-400">{t('race.voucherDays')}</span>
            <select className="input mt-1 !w-36" value={s.voucher_days} disabled={!canEdit || busy} onChange={(e) => save({ voucher_days: Number(e.target.value) })}>
              {[7, 14, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{t('race.days', { n })}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-gray-200 cursor-pointer pb-2">
            <input type="checkbox" checked={s.split_levels} disabled={!canEdit || busy} onChange={(e) => save({ split_levels: e.target.checked })} />
            {t('race.splitLevels')}
          </label>
        </div>
        <p className="text-gray-500 text-xs mt-2">{t('race.pointsHint', { c: s.points.checkin, w: s.points.win, n: s.points.no_show })}</p>
      </section>
      {err && <p className="text-red-300 text-sm -mt-2 mb-4">{err}</p>}
    </>
  );
}
