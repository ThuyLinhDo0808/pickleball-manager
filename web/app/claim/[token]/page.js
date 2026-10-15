'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import ClubAvatar from '@/components/ClubAvatar';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// A member's personal link from the club: "This is me" joins the account to that member
// (the Host typed them in by hand, so the phone may not match).
export default function ClaimPage() {
  const { token } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: c, error, loading } = useLoad(() => api.publicGet(`/api/public/member-link/${token}`), [token]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [msg, setMsg] = useState(null);

  async function claim() {
    setBusy(true);
    setMsg(null);
    try {
      setDone(await api.post(`/api/player/member-link/${token}`));
    } catch (err) {
      const code = err.payload?.code;
      setMsg({ code, text: t(`mlink.err_${code}`) === `mlink.err_${code}` ? err.message : t(`mlink.err_${code}`) });
    } finally {
      setBusy(false);
    }
  }

  if (loading && !c) return <PlayerShell requireAuth={false}><p className="text-gray-400">{t('common.loading')}</p></PlayerShell>;
  if (error || !c) return <PlayerShell requireAuth={false}><p className="card text-gray-300">{t('mlink.notFound')}</p></PlayerShell>;

  const here = `/claim/${token}`;
  return (
    <PlayerShell requireAuth={false}>
      <div className="mx-auto max-w-lg">
        <section className="card">
          <div className="flex items-center gap-3">
            <ClubAvatar id={c.club.id} name={c.club.name} sport={c.club.sport} size={52} />
            <div className="min-w-0">
              <p className="text-lime-400 text-xs font-bold uppercase tracking-widest">{t('mlink.kicker')}</p>
              <h1 className="text-white text-xl font-bold truncate">{c.club.name}</h1>
            </div>
          </div>

          {done ? (
            <div className="mt-4">
              <p className="text-lime-300 font-semibold">✓ {t('mlink.linkedTo', { club: done.club_name })}</p>
              <p className="text-gray-400 text-sm mt-1">{t('mlink.linkedHint')}</p>
              <Link href={`/c/${done.club_id}`} className="btn-primary inline-block mt-3">{t('mlink.openClub')}</Link>
            </div>
          ) : c.state !== 'ok' ? (
            <p className="mt-4 text-amber-200 text-sm">{t(c.state === 'used' ? 'mlink.err_link_used' : 'mlink.err_link_expired')}</p>
          ) : (
            <>
              <p className="mt-4 text-gray-200">{t('mlink.claimAsk', { name: c.member_name })}</p>
              <p className="mt-1 text-xs text-gray-400">{t('mlink.claimHint', { date: new Date(c.expires_at).toLocaleDateString('vi-VN') })}</p>
              {!user ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/sign-in?next=${encodeURIComponent(here)}`} className="btn-primary">{t('mlink.signIn')}</Link>
                  <Link href={`/sign-in?mode=signUp&next=${encodeURIComponent(here)}`} className="btn-secondary">{t('mlink.signUp')}</Link>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn-primary" disabled={busy} onClick={claim}>✓ {busy ? t('common.loading') : t('mlink.claimBtn', { name: c.member_name })}</button>
                  <Link href="/home" className="btn-secondary">{t('mlink.notMe')}</Link>
                </div>
              )}
              {msg && (
                <p className="mt-3 text-red-300 text-sm">
                  {msg.text}
                  {msg.code === 'email_verify_required' && <> <Link href={`/verify-email?next=${encodeURIComponent(here)}`} className="underline">{t('everify.barCta')}</Link></>}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </PlayerShell>
  );
}
