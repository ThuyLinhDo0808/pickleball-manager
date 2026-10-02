'use client';
import { useI18n } from '@/context/I18nContext';

// Where the member lives, how long they have played, and the Host's own A-D rank.
export const PLAY_DURATIONS = ['lt6', '6_12', '12_18', 'gt18'];
export const RANKS = ['A', 'B', 'C', 'D'];

const RANK_STYLE = {
  A: 'border-lime-400/70 text-lime-300 bg-lime-400/10',
  B: 'border-sky-400/70 text-sky-300 bg-sky-400/10',
  C: 'border-amber-400/70 text-amber-300 bg-amber-400/10',
  D: 'border-gray-500 text-gray-300 bg-navy-700/40',
};

export function RankBadge({ rank, className = '' }) {
  const { t } = useI18n();
  if (!rank) return <span className="text-gray-500">—</span>;
  return (
    <span title={t('memberX.rankTitle', { rank })} className={`inline-block text-xs font-bold rounded border px-1.5 leading-5 ${RANK_STYLE[rank] || RANK_STYLE.D} ${className}`}>
      {rank}
    </span>
  );
}

export function playDurationText(v, t) {
  return v ? t(`memberX.dur_${v}`) : null;
}

// The three inputs, for the add / edit member forms. `value` holds district,
// play_duration and real_rank; `onChange(patch)`.
export function MemberExtraFields({ value, onChange, idPrefix = 'mx' }) {
  const { t } = useI18n();
  return (
    <>
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-district`} className="text-xs text-gray-400">{t('memberX.district')}</label>
        <input
          id={`${idPrefix}-district`}
          className="input"
          maxLength={80}
          placeholder={t('memberX.districtPh')}
          value={value.district || ''}
          onChange={(e) => onChange({ district: e.target.value })}
        />
      </div>
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-dur`} className="text-xs text-gray-400">{t('memberX.playDuration')}</label>
        <select id={`${idPrefix}-dur`} className="input" value={value.play_duration || ''} onChange={(e) => onChange({ play_duration: e.target.value })}>
          <option value="">—</option>
          {PLAY_DURATIONS.map((d) => (
            <option key={d} value={d}>{t(`memberX.dur_${d}`)}</option>
          ))}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-rank`} className="text-xs text-gray-400">{t('memberX.realRank')}</label>
        <select id={`${idPrefix}-rank`} className="input" value={value.real_rank || ''} onChange={(e) => onChange({ real_rank: e.target.value })}>
          <option value="">—</option>
          {RANKS.map((r) => (
            <option key={r} value={r}>{t('memberX.rankOption', { rank: r })}</option>
          ))}
        </select>
      </div>
    </>
  );
}
