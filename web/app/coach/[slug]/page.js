'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import MapLink from '@/components/MapLink';
import { Avatar } from '@/components/PlayerChip';
import EmptyState from '@/components/ui/EmptyState';
import LoadingBlock from '@/components/ui/LoadingBlock';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// A coach's public page (/coach/<slug>): who they are, where and what they teach.
// Classes and sign-up arrive in the next batches. No phone number here.
export default function CoachPublicPage() {
  const { slug } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const { data, error, loading } = useLoad(() => api.publicGet(`/api/public/coach/${slug}`), [slug]);

  if (loading && !data) return <PlayerShell requireAuth={false}><LoadingBlock rows={3} className="card" /></PlayerShell>;
  if (error || !data) {
    return (
      <PlayerShell requireAuth={false}>
        <p className="card text-gray-300">{error?.status === 404 ? t('coach.notFound') : error?.message}</p>
        <Link href={user ? '/home' : '/'} className="btn-secondary inline-block mt-3">← {t('common.back')}</Link>
      </PlayerShell>
    );
  }
  const c = data;
  return (
    <PlayerShell requireAuth={false} sport={c.sport}>
      <section className="card mb-4">
        <div className="flex items-start gap-4">
          <Avatar uid={c.avatar_uid} v={c.avatar_v} name={c.display_name} size={64} />
          <div className="min-w-0 flex-1">
            <p className="text-gray-400 text-xs">{t('coach.publicKicker')}</p>
            <h1 className="text-white text-2xl font-bold break-words">{c.display_name}</h1>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="text-[11px] rounded-full border border-navy-500 text-gray-300 px-2 py-0.5">{t(`clubs.sport_${c.sport}`)}</span>
              {c.level_text && <span className="text-[11px] rounded-full border border-lime-400/40 text-lime-200 px-2 py-0.5">{c.level_text}</span>}
              {c.status === 'paused' && <span className="text-[11px] rounded-full border border-amber-300/50 text-amber-200 px-2 py-0.5">{t('coach.status_paused')}</span>}
            </div>
          </div>
        </div>
        {c.bio && <p className="text-gray-200 text-sm mt-4 whitespace-pre-line break-words">{c.bio}</p>}
      </section>

      <section className="card mb-4 grid gap-2 text-sm">
        <h2 className="text-white font-semibold">{t('coach.secWhere')}</h2>
        {c.area && <p className="text-gray-300"><span className="text-gray-500">{t('coach.f_area')}:</span> {c.area}</p>}
        {(c.court_name || c.map_url) && (
          <div className="text-gray-300">
            <span className="text-gray-500">{t('coach.f_court_name')}:</span> {c.court_name || '—'}
            {c.map_url && <span className="ml-2"><MapLink location={c.court_name} mapUrl={c.map_url} showHint={false} /></span>}
          </div>
        )}
        {c.price_note && <p className="text-gray-300"><span className="text-gray-500">{t('coach.f_price_note')}:</span> {c.price_note}</p>}
        {!c.area && !c.court_name && !c.price_note && <p className="text-gray-500">—</p>}
      </section>

      <section className="card">
        <h2 className="text-white font-semibold mb-2">{t('coach.classesTitle')}</h2>
        <EmptyState title={t('coach.noClassesYet')}>{t('coach.noClassesHint')}</EmptyState>
      </section>
    </PlayerShell>
  );
}
