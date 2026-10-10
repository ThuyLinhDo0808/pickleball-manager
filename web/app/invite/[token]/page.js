'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import ClubAvatar from '@/components/ClubAvatar';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLoad } from '@/lib/useLoad';
import { api, clubImage } from '@/lib/api';

// A club's invite link: see the club, then ask to join (the club's waiting list).
export default function InvitePage() {
  const { token } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: c, error, loading } = useLoad(() => api.publicGet(`/api/public/invite/${token}`), [token]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState(null);

  async function join(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.post(`/api/player/invite/${token}/join`, { note });
      setDone(true);
    } catch (err) {
      const code = err.payload?.code;
      setMsg({ code, text: t(`disc.err_${code}`) === `disc.err_${code}` ? err.message : t(`disc.err_${code}`) });
    } finally {
      setBusy(false);
    }
  }

  if (loading && !c) return <PlayerShell requireAuth={false}><p className="text-gray-400">{t('common.loading')}</p></PlayerShell>;
  if (error || !c) return <PlayerShell requireAuth={false}><p className="card text-gray-300">{t('invite.notFound')}</p></PlayerShell>;

  const cover = clubImage(c.id, 'cover', c.cover_version);
  return (
    <PlayerShell requireAuth={false}>
      <div className="mx-auto max-w-lg">
        <section className="overflow-hidden rounded-2xl border border-navy-700 bg-navy-900/70">
          <div className="relative h-32 bg-gradient-to-br from-navy-800 via-navy-900 to-lime-900/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
            <span className="absolute -bottom-7 left-4">
              <ClubAvatar id={c.id} name={c.name} sport={c.sport} size={68} img={clubImage(c.id, 'avatar', c.avatar_version)} ring="ring-4 ring-navy-950" />
            </span>
          </div>
          <div className="p-4 pt-10">
            <p className="text-lime-400 text-xs font-bold uppercase tracking-widest">{t('invite.kicker')}</p>
            <h1 className="text-white text-2xl font-bold">{c.name}</h1>
            <p className="text-gray-400 text-sm">
              {c.sport === 'badminton' ? '🏸' : '🏓'} {t(`onb.sport_${c.sport}`)} · 👥 {t('disc.members', { n: c.member_count ?? 0 })}
              {[c.district, c.province].filter(Boolean).length > 0 && ` · 📍 ${[c.district, c.province].filter(Boolean).join(', ')}`}
            </p>
            {c.schedule && <p className="text-gray-300 text-sm mt-1">🗓 {c.schedule}</p>}
            {c.description && <p className="text-gray-300 text-sm mt-2 whitespace-pre-line">{c.description}</p>}
          </div>
        </section>

        <section className="card mt-4">
          {done ? (
            <>
              <p className="text-lime-300 font-semibold">✓ {t('invite.sent')}</p>
              <p className="text-gray-400 text-sm mt-1">{t('invite.sentHint')}</p>
              <Link href="/home" className="btn-secondary inline-block mt-3">{t('creq.toHome')}</Link>
            </>
          ) : !user ? (
            <>
              <p className="text-gray-300 text-sm mb-3">{t('invite.signIn')}</p>
              <Link href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`} className="btn-primary inline-block">{t('disc.signInToJoin')}</Link>
            </>
          ) : (
            <form onSubmit={join} className="flex flex-col gap-3">
              <p className="text-gray-300 text-sm">{t('disc.askBody')}</p>
              <label className="block">
                <span className="text-xs text-gray-300">{t('disc.askNote')}</span>
                <textarea className="input mt-1" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('disc.askNotePh')} />
              </label>
              {msg && (
                <p className="text-red-300 text-sm">
                  {msg.text}
                  {msg.code === 'profile_required' && <> <Link href="/p/profile" className="underline">{t('disc.completeProfile')}</Link></>}
                </p>
              )}
              <button className="btn-primary" disabled={busy}>🙋 {busy ? t('common.loading') : t('invite.join')}</button>
            </form>
          )}
        </section>
      </div>
    </PlayerShell>
  );
}
