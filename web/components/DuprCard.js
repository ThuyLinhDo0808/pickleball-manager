'use client';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { Change } from '@/components/DuprMembers';
import { localDate } from '@/lib/dates';
import Hint from '@/components/ui/Hint';

const fmtRating = (v) => (v == null ? 'NR' : Number(v).toFixed(3));

// The player's own DUPR ratings (player pages), as last imported by one of their clubs from
// the DUPR Club member list. `dupr` = GET /api/player/me → dupr.
export default function DuprCard({ dupr, showLink = true }) {
  const { t } = useI18n();
  if (!dupr) return null;
  if (!dupr.linked) {
    return (
      <div className="rounded-xl border border-navy-700 bg-navy-900/40 p-3 text-sm">
        {dupr.dupr_id ? (
          <p className="text-gray-300">
            {t('duprp.waiting', { id: dupr.dupr_id })}
          </p>
        ) : (
          <p className="text-gray-300">
            {t('duprp.noId')}{' '}
            {showLink && <Link href="/p/profile" className="text-lime-300 underline">{t('duprp.addId')}</Link>}
          </p>
        )}
      </div>
    );
  }
  const Box = ({ label, value, change, rel }) => (
    <div className="rounded-xl border border-navy-700 bg-navy-900/40 px-3 py-2.5">
      <p className="text-[11px] text-gray-400 font-semibold">{label}</p>
      <p className="text-2xl font-bold text-white tabular-nums">{fmtRating(value)}</p>
      <p className="text-xs leading-tight">
        <Change v={change} />
        {rel != null && value != null && <span className="text-gray-500 ml-1">{t('dupr.rel', { n: rel })}</span>}
      </p>
    </div>
  );
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <Box label={t('dupr.doubles')} value={dupr.doubles} change={dupr.doubles_change} rel={dupr.doubles_rel} />
        <Box label={t('dupr.singles')} value={dupr.singles} change={dupr.singles_change} rel={dupr.singles_rel} />
      </div>
      <p className="text-gray-500 text-xs mt-2">
        DUPR ID <span className="font-mono text-gray-300">{dupr.dupr_id}</span>
        {dupr.dupr_name ? ` (${dupr.dupr_name})` : ''} · {t('dupr.updatedOn', { date: localDate(new Date(dupr.synced_at), 'vi-VN') })}
      </p>
      <Hint text={t('duprp.how')} className="mt-0.5" />
    </div>
  );
}
