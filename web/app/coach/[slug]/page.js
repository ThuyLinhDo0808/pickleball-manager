'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import Captcha from '@/components/Captcha';
import { ENROLL_TONE } from '@/components/coach/StudentRow';
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
import { RatingLine, BookOneOnOne, Reviews } from '@/components/coach/PublicExtras';

// A coach's public page (/coach/<slug>): who they are, where and what they teach.
// Packages (buy when signed in), classes with sign-up. No phone number here.
export default function CoachPublicPage() {
  const { slug } = useParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { data, error, loading } = useLoad(() => api.publicGet(`/api/public/coach/${slug}`), [slug]);
  // Signed in: which of these classes am I already on?
  const { data: mine, reload: reloadMine } = useLoad(() => (user ? api.get('/api/player/coach').catch(() => []) : Promise.resolve([])), [user?.id]);
  const [signup, setSignup] = useState(null); // the class being signed up for
  const [q, setQ] = useState({ full_name: '', phone: '', pay_mode: 'package' });
  const [captcha, setCaptcha] = useState('');
  const capRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { token?, status, already }
  const [msg, setMsg] = useState('');
  const liveOf = (classId) => (mine || []).find((e) => e.class?.id === classId && ['requested', 'confirmed', 'waitlist'].includes(e.status));
  async function buyPackage(p) {
    if (!window.confirm(t('coach.buyAsk', { name: p.name, price: formatVnd(p.price) }))) return;
    setBusy(true);
    try {
      await api.post(`/api/player/coach/coaches/${slug}/packages/${p.id}/buy`, {});
      window.location.href = '/p#my-coach';
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  function openSignup(k) {
    setSignup(k);
    setDone(null);
    setMsg('');
    setQ({ full_name: '', phone: '', pay_mode: k.fee > 0 ? 'per_session' : 'package' });
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      if (user) {
        const r = await api.post(`/api/player/coach/classes/${signup.id}/enroll`, { pay_mode: q.pay_mode });
        setDone({ status: r.status });
        reloadMine();
      } else {
        const r = await api.publicPost(`/api/public/coach/${slug}/quick`, { class_id: signup.id, full_name: q.full_name.trim(), phone: q.phone.trim(), pay_mode: q.pay_mode, captcha_token: captcha });
        setDone(r);
      }
    } catch (err) {
      const code = err.payload?.code;
      setMsg(t(`coach.err_${code}`) === `coach.err_${code}` ? err.message : t(`coach.err_${code}`));
      capRef.current?.reset();
    } finally {
      setBusy(false);
    }
  }

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
            <RatingLine rating={c.rating} count={c.reviews_count} />
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
                <div className="flex justify-end mt-1">
                  {user ? (
                    <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => buyPackage(p)}>{t('coach.buy')}</button>
                  ) : (
                    <Link href={`/sign-in?next=${encodeURIComponent(`/coach/${slug}`)}`} className="text-lime-300 text-sm underline min-h-[44px] inline-flex items-center">{t('coach.buySignIn')}</Link>
                  )}
                </div>
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
                  {liveOf(k.id) ? (
                    <span className={`text-[11px] rounded-full px-2 py-0.5 whitespace-nowrap ${ENROLL_TONE[liveOf(k.id).status]}`}>{t(`coach.en_${liveOf(k.id).status}`)}</span>
                  ) : k.status === 'open' && c.status === 'active' ? (
                    <button type="button" className="btn-primary text-sm" onClick={() => openSignup(k)}>{t('coach.signUp')}</button>
                  ) : (
                    <span className="text-[11px] rounded-full bg-navy-800 text-gray-400 px-2 py-0.5 whitespace-nowrap">{t('coach.signupClosed')}</span>
                  )}
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

      {c.one_on_one && c.status === 'active' && <BookOneOnOne slug={slug} />}
      <Reviews slug={slug} reviews={c.reviews || []} rating={c.rating} count={c.reviews_count} />

      <Modal open={!!signup} title={signup ? `${t('coach.signUp')} · ${signup.title}` : ''} onClose={() => setSignup(null)}>
        {signup && done && (
          <div className="grid gap-3 text-sm">
            <p className="text-white font-semibold">{done.already ? t('coach.suAlready') : t(`coach.suDone_${done.status}`)}</p>
            <p className="text-gray-300">{t(`coach.enHint_${done.status}`)}</p>
            {done.token && (
              <div className="rounded-lg border border-lime-400/40 bg-lime-400/5 px-3 py-2">
                <p className="text-gray-200">{t('coach.suKeepLink')}</p>
                <Link href={`/coach/r/${done.token}`} className="text-lime-300 underline break-all">{typeof window !== 'undefined' ? `${window.location.origin}/coach/r/${done.token}` : `/coach/r/${done.token}`}</Link>
                {!done.linked_account && <p className="text-gray-400 text-xs mt-2">{t('coach.suMakeAccount')}</p>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              {user && <Link href="/p" className="btn-secondary">{t('hub.navActivity')}</Link>}
              <button type="button" className="btn-primary" onClick={() => setSignup(null)}>{t('common.close')}</button>
            </div>
          </div>
        )}
        {signup && !done && (
          <form onSubmit={submit} className="grid gap-3">
            <p className="text-gray-300 text-sm">{scheduleText(signup, t)}{signup.court_name ? ` · ${signup.court_name}` : ''} · {t('coach.cCap', { n: signup.capacity })}</p>
            {!user && (
              <>
                <p className="text-gray-400 text-xs">{t('coach.suQuickHint')} <Link href={`/sign-in?next=${encodeURIComponent(`/coach/${slug}`)}`} className="text-lime-300 underline">{t('coach.suSignIn')}</Link></p>
                <div>
                  <label className="text-xs text-gray-400">{t('coach.st_full_name')}</label>
                  <input className="input" required maxLength={120} value={q.full_name} onChange={(e) => setQ({ ...q, full_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400">{t('coach.st_phone')}</label>
                  <input className="input" type="tel" required minLength={9} maxLength={20} value={q.phone} onChange={(e) => setQ({ ...q, phone: e.target.value })} />
                </div>
              </>
            )}
            {signup.fee > 0 && (
              <div>
                <label className="text-xs text-gray-400">{t('coach.suPay')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {['per_session', 'package'].map((k) => (
                    <button key={k} type="button" aria-pressed={q.pay_mode === k} onClick={() => setQ({ ...q, pay_mode: k })} className={`min-h-[44px] rounded-lg border text-sm px-2 ${q.pay_mode === k ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300'}`}>
                      {t(`coach.pay_${k}`)}{k === 'per_session' ? ` · ${formatVnd(signup.fee)}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!user && <Captcha ref={capRef} onToken={setCaptcha} className="flex justify-center" />}
            {msg && <p className="text-red-300 text-sm">{msg}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setSignup(null)}>{t('common.cancel')}</button>
              <button className="btn-primary" disabled={busy}>{t('coach.suCta')}</button>
            </div>
          </form>
        )}
      </Modal>
    </PlayerShell>
  );
}
