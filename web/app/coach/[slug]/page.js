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
import { formatVnd } from '@/lib/format';
import { formatDay, hhmm } from '@/lib/dates';
import { scheduleText, endTime, dmy } from '@/lib/coach';

// A coach's public page (/coach/<slug>): who they are, where and what they teach.
// Classes and sign-up arrive in the next batches. No phone number here.
export default function CoachPublicPage() {
  const { slug } = useParams();
  const { t, lang } = useI18n();
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

      {c.packages?.length > 0 && (
        <section className="card mb-4">
          <h2 className="text-white font-semibold mb-2">{t('coach.packages')}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {c.packages.map((p) => (
              <div key={p.id} className="rounded-lg border border-navy-700 px-3 py-2">
                <p className="text-white font-medium break-words">{p.name}</p>
                <p className="text-lime-400 font-bold tabular-nums">{formatVnd(p.price)}</p>
                <p className="text-gray-400 text-xs">{t('coach.pkgLine', { n: p.sessions, m: p.valid_months })}{p.note ? ` · ${p.note}` : ''}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="text-white font-semibold mb-2">{t('coach.classesTitle')}</h2>
        {!c.classes?.length ? (
          <EmptyState title={t('coach.noClassesYet')}>{t('coach.noClassesHint')}</EmptyState>
        ) : (
          <div className="grid gap-3">
            {c.classes.map((k) => (
              <div key={k.id} className="rounded-lg border border-navy-700 px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white font-semibold break-words">{k.title}</p>
                    <p className="text-gray-300 text-sm">{t(`coach.kind_${k.kind}`)} · {scheduleText(k, t)}</p>
                    <p className="text-gray-400 text-xs">{[k.court_name, k.kind !== 'single' ? `${dmy(k.date_from)} → ${dmy(k.date_to)}` : null, t('coach.cCap', { n: k.capacity }), k.fee > 0 ? t('coach.cFeeN', { v: formatVnd(k.fee) }) : t('coach.cFeePackage')].filter(Boolean).join(' · ')}</p>
                    {k.note && <p className="text-gray-400 text-xs mt-1 whitespace-pre-line break-words">{k.note}</p>}
                  </div>
                  <span className="text-[11px] rounded-full bg-navy-800 text-gray-400 px-2 py-0.5 whitespace-nowrap">{t('coach.signupSoon')}</span>
                </div>
                {k.next_sessions?.length > 0 && (
                  <p className="text-gray-300 text-xs mt-2 tabular-nums">
                    {t('coach.nextSessionsShort')}: {k.next_sessions.map((s) => `${formatDay(s.session_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit' })} ${hhmm(s.start_time)}`).join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </PlayerShell>
  );
}
