'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/PlayerChip';
import Podium from '@/components/Podium';
import Segmented from '@/components/ui/Segmented';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const Dupr = ({ p, t }) => (p.dupr != null ? (
  <span className="text-xs text-gray-300 tabular-nums">DUPR {Number(p.dupr).toFixed(2)}{p.dupr_rel != null ? ` · ${t('public.reliability')} ${Math.round(Number(p.dupr_rel))}%` : ''}</span>
) : <span className="text-xs text-gray-500">DUPR NR</span>);

// The people of a club / community on its page (signed-in players): Thường xuyên ·
// Vãng lai · Người mới, each a tile with photo, name, gender and DUPR · Uy tín.
export function ClubMembersTab({ clubId, community = true }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data, loading, error } = useLoad(() => (user ? api.get(`/api/player/discover/${clubId}/people`) : Promise.resolve(null)), [clubId, user?.id]);
  const [kind, setKind] = useState('regular');
  if (!user) return <SignInFirst t={t} />;
  if (loading && !data) return <p className="text-gray-400 text-sm">{t('common.loading')}</p>;
  if (error || !data) return <p className="card text-gray-400 text-sm">{error?.message || '—'}</p>;
  const kinds = ['regular', 'dropin', ...(data.new?.length ? ['new'] : [])];
  const rows = data[kind] || [];
  return (
    <>
      <Segmented items={kinds} value={kind} onChange={setKind} label={(k) => `${t(`cpeople.${community ? 'c' : 'k'}_${k}`)} (${(data[k] || []).length})`} className="mb-3" />
      {rows.length === 0 ? (
        <p className="card text-gray-400 text-sm">{t('cpeople.none')}</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {rows.map((p) => (
            <li key={p.id} className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center ${p.me ? 'border-lime-400/60 bg-lime-400/10' : 'border-navy-600 bg-navy-900/50'}`}>
              <Avatar uid={p.avatar_uid} v={p.avatar_v} name={p.full_name} size={44} />
              <span className="text-white text-sm font-semibold break-words leading-tight">{p.full_name}{p.me ? ` (${t('elive.you')})` : ''}</span>
              <span className="text-xs text-gray-400">{p.gender ? t(`members.${p.gender}`) : '—'}</span>
              <Dupr p={p} t={t} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Top 10 of the whole club / community: the podium (1 · 2 · 3), then 4 to 10.
export function ClubTopTab({ clubId }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [period, setPeriod] = useState('month');
  const { data, loading, error } = useLoad(() => (user ? api.get(`/api/player/discover/${clubId}/rankings?period=${period}`) : Promise.resolve(null)), [clubId, user?.id, period]);
  if (!user) return <SignInFirst t={t} />;
  return (
    <>
      <Segmented items={['month', 'quarter', 'year', 'all']} value={period} onChange={setPeriod} label={(p) => t(`rankings.${p}`)} className="mb-3" />
      {loading && !data && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {error?.status === 402 && <p className="card text-gray-300 text-sm">{t('plan.rankingsOff')}</p>}
      {data && (
        <>
          <p className="text-gray-400 text-xs mb-3">{t('rankx.rule', { n: data.min_matches })} · {t('rankings.matchesCount', { n: data.match_count })}</p>
          {data.top.length === 0 ? (
            <p className="card text-gray-400 text-sm">{t('cpeople.noRank')}</p>
          ) : (
            <>
              <Podium rows={data.top.slice(0, 3).map((r) => ({ key: r.club_member_id, full_name: r.full_name, avatar_uid: r.avatar_uid, avatar_v: r.avatar_v, main: `${r.win_rate}%`, sub: `${r.wins}-${r.losses} · ${r.point_diff > 0 ? `+${r.point_diff}` : r.point_diff}` }))} />
              {data.top.length > 3 && (
                <ol className="card !p-0 divide-y divide-navy-700">
                  {data.top.slice(3).map((r) => (
                    <li key={r.club_member_id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="w-6 text-center text-gray-400 font-bold tabular-nums">{r.rank}</span>
                      <Avatar uid={r.avatar_uid} v={r.avatar_v} name={r.full_name} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-white text-sm font-semibold break-words">{r.full_name}</span>
                        <span className="block text-gray-400 text-xs tabular-nums">{t('cpeople.record', { n: r.matches_played, w: r.wins, l: r.losses })}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-lime-300 font-bold tabular-nums">{r.win_rate}%</span>
                        <span className="block text-gray-400 text-xs tabular-nums">{r.point_diff > 0 ? `+${r.point_diff}` : r.point_diff}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

function SignInFirst({ t }) {
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3">
      <p className="text-gray-300 text-sm">{t('cpeople.signIn')}</p>
      <Link href={`/sign-in?next=${encodeURIComponent(typeof window === 'undefined' ? '/' : window.location.pathname)}`} className="btn-primary text-sm">{t('auth.signIn')}</Link>
    </div>
  );
}

