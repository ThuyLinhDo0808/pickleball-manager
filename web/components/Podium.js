'use client';
import { Avatar } from '@/components/PlayerChip';
import UiIcon from '@/components/ui/UiIcon';
import { useI18n } from '@/context/I18nContext';

// Top 1 · 2 · 3 as steps (2 · 1 · 3, the step's height by place), a gold / silver / bronze
// cup on each step. rows: the first three,
// each { key, full_name, avatar_uid?, avatar_v?, main (e.g. "75%"), sub (e.g. "3-1 · +7") }.
export default function Podium({ rows, className = 'card !pb-0 mb-4' }) {
  const { t } = useI18n();
  if (!rows?.length) return null;
  return (
    <section className={`${className} overflow-hidden`} aria-label={t('rankx.podium')}>
      <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end max-w-xl mx-auto">
        {[1, 0, 2].map((idx) => {
          const r = rows[idx];
          if (!r) return <div key={idx} />;
          const step = ['h-28 sm:h-32', 'h-20 sm:h-24', 'h-14 sm:h-16'][idx];
          const ring = ['ring-amber-300', 'ring-gray-300', 'ring-orange-400'][idx];
          const tone = ['bg-amber-300/20 border-amber-300/50 text-amber-200', 'bg-gray-300/10 border-gray-300/40 text-gray-200', 'bg-orange-400/10 border-orange-400/40 text-orange-200'][idx];
          return (
            <div key={r.key} className="flex flex-col items-center text-center min-w-0">
              <div className={`rounded-full ring-2 ${ring}`}><Avatar uid={r.avatar_uid} v={r.avatar_v} name={r.full_name} size={idx === 0 ? 56 : 44} /></div>
              <div className="mt-1.5 text-white font-semibold text-sm break-words max-w-full">{r.full_name}</div>
              {r.main != null && <div className="text-lime-300 text-sm font-bold tabular-nums">{r.main}</div>}
              <div className="text-gray-400 text-[11px] tabular-nums mb-2">{r.sub || ' '}</div>
              <div className={`w-full ${step} rounded-t-xl border border-b-0 flex flex-col items-center justify-start gap-0.5 pt-2 ${tone}`}>
                <UiIcon name="trophy" className={idx === 0 ? 'w-6 h-6 sm:w-7 sm:h-7' : 'w-5 h-5'} aria-hidden="true" />
                <span className="text-xl sm:text-2xl font-extrabold tabular-nums leading-none">{idx + 1}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
