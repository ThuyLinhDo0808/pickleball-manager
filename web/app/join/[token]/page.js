'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import PaymentCard from '@/components/PaymentCard';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd, thisMonth } from '@/lib/format';

// Public club join page (link from the Host). Viewing is open; joining needs an account.
export default function JoinClubPage() {
  const { token } = useParams();
  const { t } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const { data: club, error: loadError, loading } = useLoad(() => api.publicGet(`/api/public/clubs/${token}`), [token]);
  const [planId, setPlanId] = useState(null);
  const [startMonth, setStartMonth] = useState(thisMonth);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needProfile, setNeedProfile] = useState(false);
  const [result, setResult] = useState(null);

  const here = `/join/${token}`;
  const plan = club?.plans.find((p) => p.id === (planId || club.plans[0]?.id));

  async function join() {
    setBusy(true);
    setError('');
    try {
      setResult(await api.post(`/api/player/join/${token}`, { plan_id: plan.id, start_month: startMonth, count: Number(count) }));
    } catch (err) {
      if (err.payload?.code === 'profile_required') setNeedProfile(true);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PlayerShell requireAuth={false}><p className="text-gray-400">{t('common.loading')}</p></PlayerShell>;
  if (loadError || !club) return <PlayerShell requireAuth={false}><p className="card text-gray-300">{t('join.notFound')}</p></PlayerShell>;

  if (result) {
    return (
      <PlayerShell>
        <div className="card">
          <h1 className="text-white text-xl font-bold mb-1">{t('join.payTitle')}</h1>
          <p className="text-gray-400 text-sm mb-3">
            {result.club_name} · {result.plan_name} · {result.payment.periods.join(', ')}
          </p>
          <PaymentCard payment={result.payment} />
          <Link href="/p" className="btn-secondary block text-center mt-4">{t('join.done')}</Link>
        </div>
      </PlayerShell>
    );
  }

  return (
    <PlayerShell requireAuth={false}>
      <div className="card mb-4">
        <h1 className="text-white text-2xl font-bold">{t('join.title', { club: club.name })}</h1>
        {club.description && <p className="text-gray-300 text-sm mt-1">{club.description}</p>}
        {club.join_note && <p className="text-lime-300 text-sm mt-3 whitespace-pre-line">{club.join_note}</p>}
      </div>

      {club.plans.length === 0 ? (
        <p className="card text-gray-400 text-sm">{t('join.noPlans')}</p>
      ) : (
        <div className="card flex flex-col gap-4">
          <h2 className="text-white font-semibold">{t('join.choosePlan')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {club.plans.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlanId(p.id)}
                className={`text-left rounded-lg border p-3 ${plan?.id === p.id ? 'border-lime-400 bg-lime-400/10' : 'border-navy-700'}`}
              >
                <div className={`font-semibold ${plan?.id === p.id ? 'text-lime-400' : 'text-white'}`}>{p.name}</div>
                <div className="text-gray-300 text-sm">
                  {formatVnd(p.price)} / {t(`plans.${p.period}`).toLowerCase()} ·{' '}
                  {p.sessions_included ? t('plans.sessionsN', { n: p.sessions_included }) : t('plans.unlimited')}
                </div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">{t('join.startMonth')}</label>
              <input className="input" type="month" min={thisMonth()} value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-400">{t('join.count')}</label>
              <input className="input" type="number" inputMode="numeric" min="1" max="12" value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
          </div>
          <div className="flex items-baseline justify-between border-t border-navy-700 pt-3">
            <span className="text-gray-400 text-sm">{t('join.total')}</span>
            <span className="text-lime-400 text-2xl font-bold">{formatVnd((plan?.price || 0) * (Number(count) || 1))}</span>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {needProfile && (
            <Link href={`/p/profile?next=${encodeURIComponent(here)}`} className="text-yellow-300 text-sm underline">
              {t('join.needProfile')}
            </Link>
          )}
          {!authLoading && !user ? (
            <Link href={`/sign-in?next=${encodeURIComponent(here)}`} className="btn-primary text-center py-3">
              {t('join.signInToJoin')}
            </Link>
          ) : (
            <button className="btn-primary py-3" disabled={busy || !plan} onClick={join}>
              {t('join.confirm')}
            </button>
          )}
        </div>
      )}
    </PlayerShell>
  );
}
