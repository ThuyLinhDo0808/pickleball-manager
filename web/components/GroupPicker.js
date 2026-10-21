'use client';
import { useI18n } from '@/context/I18nContext';
import { formatVnd } from '@/lib/format';

// Kèo with several time groups: the player picks one (hours, fee per slot, places left).
export default function GroupPicker({ groups, value, onChange, need = 1 }) {
  const { t } = useI18n();
  if (!groups?.length) return null;
  return (
    <fieldset className="mb-3">
      <legend className="text-gray-400 text-xs mb-1">{t('egroups.pick')}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {groups.map((g, i) => {
          const on = value === g.id;
          const full = g.left < need;
          return (
            <label key={g.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${on ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300'}`}>
              <input type="radio" className="mt-1" name="event-group" checked={on} onChange={() => onChange(g.id)} />
              <span className="min-w-0">
                <span className="block font-semibold">🏟 {t('egroups.courtN', { n: g.courts || i + 1 })}{g.play_format ? <span className="ml-1.5 rounded-full border border-sky-400/60 px-1.5 text-[11px] font-normal text-sky-200">{t(`fmt.${g.play_format}`)}</span> : null}</span>
                <span className="block tabular-nums">🕒 {g.start_time}–{g.end_time} · {Number(g.fee_amount) > 0 ? t('egroups.feeEach', { amount: formatVnd(g.fee_amount) }) : t('public.free')}</span>
                <span className={`block text-xs ${full ? 'text-amber-300' : 'text-lime-300'}`}>{g.left > 0 ? t('egroups.left', { n: g.left, total: g.slots }) : t('egroups.full')}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// The group to start on: the first with room for `need` players, else the first.
export function firstOpenGroup(groups, need = 1) {
  if (!groups?.length) return null;
  return (groups.find((g) => g.left >= need) || groups[0]).id;
}
