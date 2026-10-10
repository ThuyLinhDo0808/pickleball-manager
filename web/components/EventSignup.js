'use client';
import LevelInput from '@/components/LevelInput';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import PaymentCard from '@/components/PaymentCard';
import TicketCard from '@/components/TicketCard';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { resizeImage } from '@/lib/image';

const ACTIVE = ['registered', 'checked_in', 'pending', 'waitlisted'];

function Steps({ current, guestPays }) {
  const { t } = useI18n();
  const steps = guestPays ? ['login', 'confirm', 'pay', 'ticket'] : ['login', 'confirm', 'ticket'];
  const at = steps.indexOf(current);
  return (
    <ol className="grid mb-4" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => (
        <li key={s} className="relative flex flex-col items-center gap-1 text-center">
          {i > 0 && <span className={`absolute top-2.5 right-1/2 w-full h-px ${i <= at ? 'bg-lime-400/50' : 'bg-navy-600'}`} aria-hidden />}
          <span
            className={`relative z-10 h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
              i < at ? 'bg-lime-400/30 text-lime-300' : i === at ? 'bg-lime-400 text-navy-950' : 'bg-navy-700 text-gray-500'
            }`}
          >
            {i < at ? '✓' : i + 1}
          </span>
          <span className={`text-[11px] leading-tight ${i === at ? 'text-white font-semibold' : 'text-gray-500'}`}>{t(`signup.step_${s}`)}</span>
        </li>
      ))}
    </ol>
  );
}

function minutesLeft(iso) {
  return iso ? Math.max(Math.ceil((new Date(iso) - Date.now()) / 60000), 0) : null;
}

export function ProfileForm({ profile, onSaved, sport = 'pickleball' }) {
  const { t } = useI18n();
  const levelKey = sport === 'badminton' ? 'badminton_level' : 'dupr_level'; // the level for this event's sport
  const [f, setF] = useState({
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
    [levelKey]: profile?.[levelKey] ?? '',
    birth_date: profile?.birth_date || '',
    gender: profile?.gender || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // Keep the rest of the profile (e.g. avatar) as it is.
      await api.put('/api/player/profile', { ...(profile || {}), ...f, [levelKey]: f[levelKey] === '' ? null : Number(f[levelKey]) });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <p className="text-gray-300 text-sm">{t('signup.profileFirst')}</p>
      <div>
        <label className="text-xs text-gray-400">{t('public.yourName')}</label>
        <input className="input" required autoComplete="name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
      </div>
      <div>
        <label className="text-xs text-gray-400">{t('public.yourPhone')}</label>
        <input className="input" required type="tel" inputMode="tel" autoComplete="tel" minLength={9} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <p className="text-gray-500 text-xs mt-1">{t('public.phoneHint')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label className="text-xs text-gray-400">{t('members.birthDate')}</label>
          <input className="input" required type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} />
        </div>
        <div className="min-w-0">
          <label className="text-xs text-gray-400">{t('members.gender')}</label>
          <select className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
            <option value="">—</option>
            <option value="male">{t('members.male')}</option>
            <option value="female">{t('members.female')}</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-400">{t('public.yourLevel')}</label>
        <LevelInput sport={sport} value={f[levelKey]} onChange={(v) => setF({ ...f, [levelKey]: v })} />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button className="btn-primary w-full py-3" disabled={busy}>{t('common.save')}</button>
    </form>
  );
}

// Who am I for this club: verified member / waiting for the Host / guest. Members are
// recognised by the phone in the profile (it must match the phone the club saved).
function MemberStanding({ me, clubName }) {
  const { t } = useI18n();
  const m = me.member;
  if (!m.is_club_event) return null;

  if (m.state === 'verified') {
    return (
      <div className="rounded-lg border border-lime-400/40 bg-lime-400/5 px-3 py-2 text-sm mb-3">
        <span className="text-lime-300 font-semibold">👤 {t('signup.youAreMember', { club: clubName })}</span>
        <div className="text-gray-300 text-xs mt-0.5">
          {m.has_pass
            ? m.sessions_remaining == null
              ? t('signup.passUnlimited')
              : t('signup.passLeft', { n: m.sessions_remaining })
            : t('signup.noPass')}
        </div>
      </div>
    );
  }
  if (m.state === 'guest') {
    return (
      <div className="rounded-lg border border-sky-400/40 bg-sky-400/5 px-3 py-2 text-sm mb-3">
        <span className="text-sky-200 font-semibold">🤝 {t('signup.youAreGuest', { club: clubName })}</span>
        {m.guest_perk && (
          <div className="text-gray-200 text-xs mt-0.5">
            ⚡ {t('signup.perkPriority')}
            {m.discount_pct > 0 && <span className="text-lime-300"> {t('signup.perkDiscount', { pct: m.discount_pct })}</span>}
          </div>
        )}
      </div>
    );
  }
  if (m.state === 'pending') {
    return <p className="rounded-lg border border-sky-400/40 bg-sky-400/5 px-3 py-2 text-sm text-sky-200 mb-3">⏳ {t('signup.memberPending')}</p>;
  }
  return <p className="text-gray-500 text-xs mb-3">{t('signup.memberByPhone', { club: clubName })}</p>;
}

function ProofUpload({ token, reg, onChanged }) {
  const { t } = useI18n();
  const file = useRef(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    try {
      setPreview(await resizeImage(f));
    } catch {
      setError(t('signup.badImage'));
    }
  }

  async function send() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/events/public/${token}/payment-proof`, { image: preview });
      setPreview('');
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input ref={file} type="file" accept="image/*" className="hidden" onChange={pick} />
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="max-h-72 w-auto self-center rounded-lg border border-navy-600" />
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1 py-3" disabled={busy} onClick={send}>{busy ? '…' : t('signup.sendProof')}</button>
            <button type="button" className="btn-secondary" onClick={() => file.current?.click()}>{t('signup.otherImage')}</button>
          </div>
        </>
      ) : (
        <button type="button" className="btn-primary w-full py-3" onClick={() => file.current?.click()}>
          📎 {reg.has_proof ? t('signup.replaceProof') : t('signup.uploadProof')}
        </button>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}

// Everything the signed-in player does on the event page: log in → confirm → pay → ticket.
export default function EventSignup({ ev, me, meError, user, token, onChanged }) {
  const { t, lang } = useI18n();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30000); // hold countdown
    return () => clearInterval(id);
  }, []);

  const fee = Number(ev.fee_amount || 0);
  const next = `/sign-in?next=${encodeURIComponent(`/e/${token}`)}`;

  if (!user || meError?.status === 401) {
    return (
      <>
        <Steps current="login" guestPays={fee > 0} />
        <h2 className="text-white font-semibold mb-1">{t('public.register')}</h2>
        <p className="text-gray-300 text-sm mb-3">{t('signup.loginWhy')}</p>
        {ev.registration_open ? (
          <Link href={next} className="btn-primary block w-full py-3 text-center">{t('signup.loginToJoin')}</Link>
        ) : (
          <p className="text-yellow-400 text-sm text-center py-2">🔒 {t(`public.closed_${ev.closed_code}`)}</p>
        )}
      </>
    );
  }
  if (meError) {
    return (
      <div className="text-center">
        <p className="text-yellow-300 text-sm">{t('public.loadError')}</p>
        <p className="text-gray-500 text-xs break-all mt-1">{meError.message}</p>
        <button type="button" className="btn-secondary mt-3" onClick={onChanged}>{t('public.retry')}</button>
      </div>
    );
  }
  if (!me) return <p className="text-gray-400 text-sm">{t('common.loading')}</p>;

  const reg = me.registration && ACTIVE.includes(me.registration.status) ? me.registration : null;
  const memberFree = me.member.state === 'verified' && me.member.has_pass;
  const myFee = me.member.my_fee ?? fee; // priority guests pay the price after their discount
  const guestPays = myFee > 0 && !memberFree;

  async function cancel() {
    // Past the free-cancellation deadline (event time is local; players are in the same timezone).
    const start = new Date(`${ev.event_date}T${(ev.start_time || '00:00').slice(0, 5)}`);
    const late = ev.cancel_deadline_hours != null && reg.status === 'registered' && Date.now() > start - ev.cancel_deadline_hours * 3600000;
    const msg = late ? t('signup.cancelAskPolicy') : t('signup.cancelAsk');
    if (!window.confirm(msg)) return;
    try {
      const r = await api.post(`/api/player/participations/${reg.id}/cancel`, {});
      window.alert(r.late ? t('pp.cancelledLate') : reg.fee_paid ? t('signup.cancelledRefund') : t('pp.cancelled'));
      onChanged();
    } catch (err) {
      window.alert(err.message);
    }
  }

  // ---- already registered -----------------------------------------------------
  if (reg?.status === 'registered' || reg?.status === 'checked_in') {
    return (
      <div className="flex flex-col items-center text-center">
        {me.survey && (
          <div className="w-full rounded-xl border-2 border-lime-400 bg-lime-400/10 px-3 py-3 mb-4">
            <p className="text-lime-300 font-bold">⭐ {t('signup.surveyTitle')}</p>
            <p className="text-gray-200 text-sm mt-0.5 mb-2">{me.survey.answered ? t('signup.surveyDone') : t('signup.surveyHint')}</p>
            <Link href={`/s/${me.survey.token}`} className={me.survey.answered ? 'btn-secondary inline-block' : 'btn-primary inline-block'}>
              {me.survey.answered ? t('signup.surveyView') : t('signup.surveyCta')}
            </Link>
          </div>
        )}
        <Steps current="ticket" guestPays={reg.kind === 'guest' && reg.fee > 0} />
        <div className="text-4xl">🎉</div>
        <p className="text-white font-bold text-lg mt-1">
          {reg.status === 'checked_in' ? t('signup.checkedIn') : t('signup.success')}
        </p>
        <p className="text-gray-400 text-sm mb-3">
          {reg.kind === 'member' ? t('signup.asMember') : t('signup.asGuest')}
          {reg.fee_paid && reg.fee > 0 ? ` · ${t('signup.paid', { amount: formatVnd(reg.fee) })}` : ''}
        </p>
        <TicketCard ticketCode={reg.ticket_code} name={reg.full_name} checkedIn={reg.status === 'checked_in'} />
        {reg.status === 'registered' && (
          <div className="flex flex-col items-center gap-2 mt-4">
            <p className="text-gray-400 text-xs max-w-xs">{t('signup.noTransfer')}</p>
            <button type="button" className="text-red-400 text-sm" onClick={cancel}>{t('events.cancel')}</button>
          </div>
        )}
      </div>
    );
  }

  if (reg?.status === 'pending') {
    const left = minutesLeft(reg.hold_expires_at);
    const holdUntil = reg.hold_expires_at && new Date(reg.hold_expires_at).toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    return (
      <div className="flex flex-col gap-3">
        <Steps current={reg.payment_status === 'proof_submitted' ? 'ticket' : 'pay'} guestPays />
        {reg.payment_status === 'proof_submitted' ? (
          <div className="rounded-xl border border-sky-400/50 bg-sky-400/10 px-3 py-3 text-center">
            <div className="text-3xl">⏳</div>
            <p className="text-sky-200 font-bold">{t('signup.hostChecking')}</p>
            <p className="text-gray-300 text-sm">{t('signup.hostCheckingHint')}</p>
          </div>
        ) : (
          <>
            <h2 className="text-white font-semibold">{t('signup.payTitle', { amount: formatVnd(reg.payment.amount) })}</h2>
            {reg.payment_status === 'rejected' && (
              <p className="rounded-lg border border-red-400/60 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                ⚠️ {t('signup.rejected')}{reg.payment_note ? `: ${reg.payment_note}` : ''}
              </p>
            )}
            {left != null && (
              <p className={`text-sm ${left <= 10 ? 'text-orange-300' : 'text-gray-400'}`}>⏱ {t('signup.holdUntil', { time: holdUntil, n: left })}</p>
            )}
          </>
        )}
        {reg.payment_status !== 'proof_submitted' && <PaymentCard payment={reg.payment} />}
        {reg.payment_status !== 'proof_submitted' && <p className="text-white text-sm font-semibold">{t('signup.afterTransfer')}</p>}
        <ProofUpload token={token} reg={reg} onChanged={onChanged} />
        <button type="button" className="text-red-400 text-sm self-center" onClick={cancel}>{t('events.cancel')}</button>
      </div>
    );
  }

  if (reg?.status === 'waitlisted') {
    return (
      <div className="text-center">
        <div className="text-4xl">⏳</div>
        <p className="text-white font-bold">{t('public.successWait')}</p>
        {guestPays && <p className="text-gray-300 text-sm mt-1">{t('signup.waitPayLater', { amount: formatVnd(reg.fee ?? myFee) })}</p>}
        <p className="text-gray-500 text-xs mt-2">{t('signup.waitNotify')}</p>
        <button type="button" className="text-red-400 text-sm mt-3" onClick={cancel}>{t('events.cancel')}</button>
      </div>
    );
  }

  // ---- not registered yet ------------------------------------------------------
  if (!ev.registration_open) {
    return <p className="text-yellow-400 text-sm text-center py-2">🔒 {t(`public.closed_${ev.closed_code}`)}</p>;
  }
  if (!me.profile?.full_name || !me.profile?.phone || !me.profile?.birth_date) return <ProfileForm profile={me.profile} onSaved={onChanged} sport={ev.sport} />;

  async function register() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/events/public/${token}/register`, {});
      onChanged();
    } catch (err) {
      // Kept out by the club: suspended ("to review") until a date, or blocked.
      const p = err.payload || {};
      if (p.code === 'club_suspended') setError(t('notice.signupSuspended', { reason: p.reason || '—', date: p.until ? new Date(p.until).toLocaleDateString('vi-VN') : '' }));
      else if (p.code === 'club_blocked') setError(t('notice.signupBlocked', { reason: p.reason || '—' }));
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const full = ev.main_count >= ev.slots;
  return (
    <div className="flex flex-col">
      <Steps current="confirm" guestPays={guestPays} />
      {me.registration?.status === 'cancelled' && <p className="text-gray-400 text-xs mb-2">{t('signup.cancelledBefore')}</p>}
      <MemberStanding me={me} clubName={ev.club_name} />
      <div className="rounded-lg bg-navy-900 px-3 py-2 text-sm mb-3">
        <div className="flex justify-between gap-2">
          <span className="text-gray-400">{t('signup.registerAs')}</span>
          <span className="text-white font-semibold">{me.profile.full_name}</span>
        </div>
        <div className="flex justify-between gap-2 mt-1">
          <span className="text-gray-400">{t('signup.youPay')}</span>
          <span className="text-white font-semibold">
            {memberFree ? t('signup.usesSession') : myFee > 0 ? formatVnd(myFee) : t('public.free')}
            {!memberFree && myFee !== fee && <span className="ml-1.5 text-gray-500 line-through font-normal">{formatVnd(fee)}</span>}
          </span>
        </div>
        {full && <p className="text-yellow-300 text-xs mt-2">{t('public.full')}</p>}
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-200 mb-3">
        <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>{t('signup.agree')}</span>
      </label>
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      <button type="button" className="btn-primary w-full py-3 text-base" disabled={!agree || busy} onClick={register}>
        {full ? t('signup.joinWaitlist') : guestPays ? t('signup.confirmAndPay') : t('signup.confirm')}
      </button>
      {guestPays && !full && <p className="text-gray-500 text-xs mt-2 text-center">{t('signup.holdNote')}</p>}
    </div>
  );
}
