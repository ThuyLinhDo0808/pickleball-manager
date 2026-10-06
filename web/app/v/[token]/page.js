'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProfileForm } from '@/components/EventSignup';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';
import { formatVnd } from '@/lib/format';

// A club meeting / get-together shared by link (Zalo, Telegram…): what, when, where, the
// fee and who is coming. Anyone can read it; voting needs an account — club members and
// people from outside the club alike (they join the club's guest list).
export default function MeetingVotePage() {
  const { token } = useParams();
  const { t, lang, setLang } = useI18n();
  const { user } = useAuth();
  const { data: ev, setData: setEv, error, loading } = useLoad(() => api.publicGet(`/api/events/public/${token}/vote`), [token]);
  const { data: me, reload: reloadMe, setData: setMe } = useLoad(() => (user ? api.get(`/api/events/public/${token}/vote/me`) : Promise.resolve(null)), [token, user?.id]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function vote(choice) {
    setBusy(true);
    setErr('');
    try {
      const r = await api.post(`/api/events/public/${token}/vote`, { choice: me?.my_vote === choice ? null : choice });
      setEv(r);
      setMe((m) => ({ ...m, my_vote: r.my_vote, in_club: true }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const langToggle = (
    <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="text-xs text-gray-400 border border-navy-700 rounded-full px-3 py-1">
      {lang === 'vi' ? 'EN' : 'VI'}
    </button>
  );
  if (loading && !ev) return <div className="min-h-screen flex items-center justify-center text-gray-400">{t('common.loading')}</div>;
  if (error || !ev) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-gray-300">{t('public.notFound')}</p>
        {langToggle}
      </div>
    );
  }

  const time = [hhmm(ev.start_time), hhmm(ev.end_time)].filter(Boolean).join(' – ');
  const total = ev.yes + ev.no || 1;
  const needProfile = me && !me.in_club && (!me.profile?.full_name || !me.profile?.phone);

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 pt-safe pb-safe-4">
      <header className="flex items-center justify-between py-4">
        <span className="text-lime-400 font-bold">{ev.club_name || t('appName')}</span>
        {langToggle}
      </header>

      <section className="card mb-4">
        <p className="text-gray-400 text-xs uppercase tracking-wide">👥 {t('vote.kicker')}</p>
        <h1 className="text-white text-2xl font-bold leading-tight mt-1">{ev.title}</h1>
        <p className="text-lime-400 text-sm mt-1 capitalize">
          {formatDay(ev.event_date, lang, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          {time && ` · ${time}`}
        </p>
        {ev.location && <p className="text-gray-300 text-sm mt-1">📍 {ev.location}</p>}
        <p className="text-gray-300 text-sm mt-1">💰 {Number(ev.fee_amount) > 0 ? `${formatVnd(ev.fee_amount)} / ${t('vote.perPerson')}` : t('public.free')}</p>
        {ev.notice && (
          <div className="mt-3 rounded-lg bg-navy-900 px-3 py-2">
            <div className="text-gray-400 text-xs">📋 {t('mtg.agenda')}</div>
            <p className="text-gray-200 text-sm whitespace-pre-line">{ev.notice}</p>
          </div>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="text-white font-semibold mb-3">🗳 {t('meeting.question')}</h2>
        {ev.closed ? (
          <p className="text-gray-400 text-sm">{t('vote.closed')}</p>
        ) : !user ? (
          <Link href={`/sign-in?next=${encodeURIComponent(`/v/${token}`)}`} className="btn-primary w-full block text-center">{t('vote.signIn')}</Link>
        ) : !me ? (
          <p className="text-gray-400 text-sm">{t('common.loading')}</p>
        ) : needProfile ? (
          <ProfileForm profile={me.profile} onSaved={reloadMe} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {['yes', 'no'].map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={busy}
                  aria-pressed={me.my_vote === c}
                  onClick={() => vote(c)}
                  className={`rounded-xl border py-3 font-semibold ${me.my_vote === c ? (c === 'yes' ? 'bg-lime-400 text-navy-950 border-lime-400' : 'bg-red-500 text-white border-red-500') : 'border-navy-600 text-gray-200 hover:border-navy-500'}`}
                >
                  {c === 'yes' ? `✓ ${t('meeting.yes')}` : `✗ ${t('meeting.no')}`}
                </button>
              ))}
            </div>
            <p className="text-gray-500 text-xs mt-2">
              {me.my_vote ? t('vote.changeHint') : !me.in_club ? t('vote.guestHint') : t('vote.memberHint')}
            </p>
          </>
        )}
        {err && <p className="text-red-400 text-sm mt-2">{err}</p>}
      </section>

      <section className="card mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-white font-semibold">{t('vote.coming', { n: ev.yes })}</h2>
          <span className="text-gray-400 text-xs">{t('meeting.counts', { yes: ev.yes, no: ev.no })}</span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-navy-700 mb-3" aria-hidden="true">
          <span className="bg-lime-400" style={{ width: `${(100 * ev.yes) / total}%` }} />
          <span className="bg-red-500" style={{ width: `${(100 * ev.no) / total}%` }} />
        </div>
        {ev.coming.length === 0 ? (
          <p className="text-gray-400 text-sm">{t('vote.nobody')}</p>
        ) : (
          <ol className="flex flex-col divide-y divide-navy-700">
            {ev.coming.map((n, i) => (
              <li key={i} className="py-2 text-sm text-gray-200">
                <span className="text-gray-500 w-6 inline-block">{i + 1}.</span>
                {n}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
