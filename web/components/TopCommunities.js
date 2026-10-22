'use client';
import Link from 'next/link';
import ClubAvatar from '@/components/ClubAvatar';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api, clubImage } from '@/lib/api';
import Hint from '@/components/ui/Hint';

// Top 10 cộng đồng uy tín (paid placement, checked by the Owner): shown on the club search.
export default function TopCommunities({ className = '' }) {
  const { t } = useI18n();
  const { data } = useLoad(() => api.publicGet('/api/public/discover/top-communities').catch(() => []), []);
  if (!data?.length) return null;
  return (
    <section className={`card border-amber-300/40 ${className}`}>
      <h2 className="text-amber-200 font-bold text-lg">{t('featured.publicTitle')} <Hint inline text={t('featured.publicHint')} /></h2>
      <ol className="flex flex-col divide-y divide-navy-700">
        {data.map((c) => (
          <li key={c.id}>
            <Link href={`/discover/${c.id}`} className="flex items-center gap-3 py-2.5 hover:bg-navy-800/60 rounded-lg px-1">
              <span className={`w-8 text-center font-bold tabular-nums ${c.rank <= 3 ? 'text-lime-300' : 'text-gray-400'}`}>{c.rank}</span>
              <ClubAvatar id={c.id} name={c.name} sport={c.sport} size={40} img={clubImage(c.id, 'avatar', c.avatar_version)} />
              <span className="min-w-0 flex-1">
                <span className="block text-white font-semibold break-words">{c.name} <span className="text-[11px] text-lime-300 font-normal">✓ {t('featured.verified')}</span></span>
                <span className="block text-gray-400 text-xs break-words">
                  {[c.district, c.province].filter(Boolean).join(', ')}
                  {` · ${t('featured.membersN', { n: c.members })}`}
                  {c.rating != null ? ` · ${c.rating}★` : ''}
                </span>
              </span>
              <span className="text-gray-500">›</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
