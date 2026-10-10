'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import ClubAvatar from '@/components/ClubAvatar';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLoad } from '@/lib/useLoad';
import { api, clubImage } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';
import { formatVnd } from '@/lib/format';

// A club found in the search: its profile, its coming sessions (sign up through the
// public link when the club opened it), and "ask to join".
export default function DiscoverClubPage() {
  const { clubId } = useParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { data, error, loading } = useLoad(() => api.publicGet(`/api/public/discover/clubs/${clubId}`), [clubId]);
  const { data: rel, reload: reloadRel } = useLoad(() => (user ? api.get(`/api/player/discover/${clubId}`).catch(() => null) : Promise.resolve(null)), [clubId, user?.id]);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function askToJoin(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.post(`/api/player/discover/${clubId}/join`, { note });
      setAsking(false);
      setMsg({ ok: true, text: t('disc.askSent') });
      reloadRel();
    } catch (err) {
      const code = err.payload?.code;
      setMsg({ ok: false, code, text: t(`disc.err_${code}`) === `disc.err_${code}` ? err.message : t(`disc.err_${code}`) });
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <PlayerShell requireAuth={false}><p className="text-gray-400">{t('common.loading')}</p></PlayerShell>;
  if (error || !data) {
    return (
      <PlayerShell requireAuth={false}>
        <p className="card text-gray-300">{error?.status === 404 ? t('disc.notFound') : error?.message}</p>
        <Link href="/discover" className="btn-secondary inline-block mt-3">← {t('disc.back')}</Link>
      </PlayerShell>
    );
  }

  const c = data.club;
  const cover = clubImage(c.id, 'cover', c.cover_version);
  const state = rel?.state;
  const here = `/discover/${clubId}`;

  return (
    <PlayerShell requireAuth={false}>
      <Link href="/discover" className="text-gray-400 hover:text-white text-sm">← {t('disc.back')}</Link>
      <section className="mt-2 overflow-hidden rounded-2xl border border-navy-700 bg-navy-900/70">
        <div className="relative h-36 sm:h-48 bg-gradient-to-br from-navy-800 via-navy-900 to-lime-900/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
          <span className="absolute -bottom-8 left-4">
            <ClubAvatar id={c.id} name={c.name} sport={c.sport} size={80} img={clubImage(c.id, 'avatar', c.avatar_version)} ring="ring-4 ring-navy-950" />
          </span>
        </div>
        <div className="p-4 pt-11">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-white text-2xl font-bold leading-tight">{c.name}</h1>
              <p className="text-gray-400 text-sm mt-0.5">{c.sport === 'badminton' ? '🏸' : '🏓'} {t(`onb.sport_${c.sport}`)} · 👥 {t('disc.members', { n: c.member_count ?? 0 })}</p>
            </div>
            <div className="shrink-0">
              {!user ? (
                <Link href={`/sign-in?next=${encodeURIComponent(here)}`} className="btn-primary">{t('disc.signInToJoin')}</Link>
              ) : state === 'owner' ? (
                <span className="rounded-full bg-lime-400 text-navy-950 text-xs font-bold px-3 py-1">{t('disc.yourClub')}</span>
              ) : state === 'member' ? (
                <Link href={`/c/${c.id}`} className="btn-secondary">✓ {t('disc.isMember')}</Link>
              ) : state === 'requested' ? (
                <span className="rounded-full border border-amber-300/60 text-amber-200 text-xs font-semibold px-3 py-1">⏳ {t('disc.requested')}</span>
              ) : (
                <button type="button" className="btn-primary" onClick={() => { setMsg(null); setAsking(true); }}>🙋 {t('disc.askToJoin')}</button>
              )}
            </div>
          </div>
          {msg && (
            <p className={`mt-3 text-sm ${msg.ok ? 'text-lime-300' : 'text-red-300'}`}>
              {msg.ok ? '✓ ' : ''}{msg.text}
              {msg.code === 'profile_required' && <> <Link href="/p/profile" className="underline">{t('disc.completeProfile')}</Link></>}
            </p>
          )}
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-gray-500 text-xs">{t('creq.address')}</dt><dd className="text-gray-100">📍 {c.address || '—'}</dd></div>
            <div><dt className="text-gray-500 text-xs">{t('creq.where')}</dt><dd className="text-gray-100">{[c.district, c.province, c.country].filter(Boolean).join(', ') || '—'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-gray-500 text-xs">{t('creq.schedule')}</dt><dd className="text-gray-100">🗓 {c.schedule || t('disc.noSchedule')}</dd></div>
          </dl>
          {c.description && <p className="mt-3 text-gray-300 text-sm whitespace-pre-line">{c.description}</p>}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-white font-semibold mb-2">{t('disc.events')}</h2>
        {data.events.length === 0 && <p className="card text-gray-400 text-sm">{t('disc.noEvents')}</p>}
        <ul className="flex flex-col gap-2">
          {data.events.map((e) => (
            <li key={e.id} className="card !p-3 flex flex-wrap items-start gap-x-3 gap-y-2">
              <div className="w-16 shrink-0 text-center">
                <div className="text-lime-300 text-xs font-semibold capitalize">{formatDay(e.event_date, lang, { weekday: 'short' })}</div>
                <div className="text-white text-lg font-bold tabular-nums">{formatDay(e.event_date, lang, { day: '2-digit', month: '2-digit' })}</div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold leading-snug">{e.title}</p>
                <p className="text-gray-400 text-xs">
                  {[e.start_time && `${hhmm(e.start_time)}${e.end_time ? `–${hhmm(e.end_time)}` : ''}`, e.location].filter(Boolean).join(' · ')}
                </p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {e.slots ? t('disc.slots', { n: e.main_count || 0, m: e.slots }) : null}
                  {Number(e.fee_amount) > 0 ? ` · ${formatVnd(e.fee_amount)}` : ` · ${t('public.free')}`}
                </p>
              </div>
              <div className="w-full sm:w-auto sm:shrink-0 sm:self-center text-right">
                {e.link ? (
                  <Link href={`/e/${e.link}`} className="btn-primary !py-1.5 text-sm block text-center sm:inline-block">{t('disc.joinEvent')}</Link>
                ) : (
                  <span className="text-gray-500 text-[11px]">{e.status === 'closed' ? t('disc.eventClosed') : t('disc.membersOnly')}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Modal open={asking} title={t('disc.askTitle', { club: c.name })} onClose={() => setAsking(false)}>
        <form onSubmit={askToJoin} className="flex flex-col gap-3">
          <p className="text-gray-300 text-sm">{t('disc.askBody')}</p>
          <label className="block">
            <span className="text-xs text-gray-300">{t('disc.askNote')}</span>
            <textarea className="input mt-1" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('disc.askNotePh')} />
          </label>
          {msg && !msg.ok && <p className="text-red-300 text-sm">{msg.text}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => setAsking(false)}>{t('common.cancel')}</button>
            <button className="btn-primary" disabled={busy}>{busy ? t('common.loading') : t('disc.askSend')}</button>
          </div>
        </form>
      </Modal>
    </PlayerShell>
  );
}
