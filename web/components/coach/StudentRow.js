'use client';
import { Avatar } from '@/components/PlayerChip';
import { useI18n } from '@/context/I18nContext';

export const ENROLL_TONE = {
  requested: 'bg-amber-300/15 text-amber-200',
  confirmed: 'bg-lime-400/15 text-lime-300',
  waitlist: 'bg-sky-400/15 text-sky-200',
  cancelled: 'bg-navy-700 text-gray-300',
  removed: 'bg-navy-700 text-gray-300',
};

// One student in a list: avatar, name, phone (coach only), account / quick tag.
export function StudentLine({ s, sub, right }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar uid={s.avatar_uid} v={s.avatar_v} name={s.full_name} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block text-white font-medium break-words">
          {s.full_name}
          {!s.user_id && <span className="ml-1.5 align-middle text-[10px] rounded-full bg-navy-700 text-gray-300 px-1.5 py-0.5">{t('coach.stNoAccount')}</span>}
          {s.status === 'blocked' && <span className="ml-1.5 align-middle text-[10px] rounded-full bg-red-500/20 text-red-200 px-1.5 py-0.5">{t('coach.ststatus_blocked')}</span>}
          {s.status === 'left' && <span className="ml-1.5 align-middle text-[10px] rounded-full bg-navy-700 text-gray-300 px-1.5 py-0.5">{t('coach.ststatus_left')}</span>}
        </span>
        <span className="block text-gray-400 text-xs tabular-nums break-words">{[s.phone, s.level_text, sub].filter(Boolean).join(' · ') || '—'}</span>
      </span>
      {right}
    </div>
  );
}

// The buttons the coach has on an enrolment: confirm / waiting list / remove.
export function EnrollActions({ e, onDecide, busy }) {
  const { t } = useI18n();
  const btn = (status, cls, label) => (
    <button key={status} type="button" disabled={busy} className={`text-xs px-2 min-h-[44px] ${cls}`} onClick={() => onDecide(e, status)}>{label}</button>
  );
  const live = ['requested', 'confirmed', 'waitlist'].includes(e.status);
  return (
    <span className="shrink-0 inline-flex items-center gap-0.5 whitespace-nowrap">
      <span className={`text-[11px] rounded-full px-2 py-0.5 mr-1 ${ENROLL_TONE[e.status]}`}>{t(`coach.en_${e.status}`)}</span>
      {live && e.status !== 'confirmed' && btn('confirmed', 'text-lime-300 hover:text-lime-200', t('coach.enConfirm'))}
      {live && e.status !== 'waitlist' && btn('waitlist', 'text-sky-200 hover:text-white', t('coach.enWait'))}
      {live && btn('removed', 'text-red-300 hover:text-red-200', t('coach.enRemove'))}
      {!live && btn('confirmed', 'text-lime-300 hover:text-lime-200', t('coach.enReadd'))}
    </span>
  );
}
