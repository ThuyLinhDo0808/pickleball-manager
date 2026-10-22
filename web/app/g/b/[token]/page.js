'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import HomeLink from '@/components/HomeLink';
import MapLink from '@/components/MapLink';
import PaymentCard from '@/components/PaymentCard';
import TicketCard from '@/components/TicketCard';
import Countdown from '@/components/Countdown';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { formatDay, hhmm } from '@/lib/dates';
import { resizeImage } from '@/lib/image';
import UiIcon from '@/components/ui/UiIcon';

// A quick booking (invite link, no account): the Host checks the players' info, then pay the
// total, send the screenshot, then the tickets. This page's link is the only way back to the booking — the guest keeps it.
export default function QuickBookingPage() {
  const { token } = useParams();
  const { t, lang, setLang } = useI18n();
  const { data: b, error, loading, reload } = useLoad(() => api.publicGet(`/api/public/quick/booking/${token}`), [token]);
  const file = useRef(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  // While the Host checks the info or the transfer, look again now and then.
  useEffect(() => {
    if (!['proof_submitted', 'requested'].includes(b?.state)) return undefined;
    const id = setInterval(reload, 20000);
    return () => clearInterval(id);
  }, [b?.state, reload]);

  const langToggle = (
    <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="text-xs text-gray-400 border border-navy-700 rounded-full px-3 py-1">
      {lang === 'vi' ? 'EN' : 'VI'}
    </button>
  );
  if (loading && !b) return <div className="min-h-screen flex items-center justify-center text-gray-400">{t('common.loading')}</div>;
  if (error || !b) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-gray-300">{!error || error.status === 404 ? t('quick.bookingNotFound') : t('public.loadError')}</p>
        {error && error.status !== 404 && <button className="btn-secondary" onClick={reload}>{t('public.retry')}</button>}
        {langToggle}
      </div>
    );
  }

  const e = b.event;
  const time = [hhmm(e.start_time), hhmm(e.end_time)].filter(Boolean).join(' – ');

  async function pick(ev) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    setErr('');
    try {
      setPreview(await resizeImage(f));
    } catch {
      setErr(t('signup.badImage'));
    }
  }
  async function send() {
    setBusy(true);
    setErr('');
    try {
      await api.publicPost(`/api/public/quick/booking/${token}/proof`, { image: preview });
      setPreview('');
      reload();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt(t('quick.keepLink'), window.location.href);
    }
  }

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 pt-safe pb-safe-4">
      <header className="flex items-center justify-between py-4">
        <span className="text-lime-400 font-bold break-words">{e.club_name || t('appName')}</span>
        <div className="flex items-center gap-2">
          <HomeLink />
          {langToggle}
        </div>
      </header>

      <section className="card mb-4">
        <h1 className="text-white text-xl font-bold leading-tight">{e.title}</h1>
        <p className="text-lime-400 text-sm mt-1 capitalize">
          {formatDay(e.event_date, lang, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          {time && ` · ${time}`}
        </p>
        {(e.location || e.map_url) && <p className="mt-1"><MapLink location={e.location} mapUrl={e.map_url} /></p>}
      </section>

      <section className="card mb-4 !py-3">
        <p className="text-sm text-amber-200">{t('quick.keepLinkHint')}</p>
        <button type="button" className="btn-secondary text-sm mt-2" onClick={copyLink}>{copied ? t('events.copied') : t('quick.keepLink')}</button>
      </section>

      <section className="card mb-4">
        {b.state === 'confirmed' && (
          <div className="text-center mb-3">
            <div className="text-4xl"></div>
            <p className="text-white font-bold text-lg">{t('quick.doneTitle')}</p>
            <p className="text-gray-300 text-sm">{t('quick.doneHint')}</p>
          </div>
        )}
        {b.state === 'proof_submitted' && (
          <div className="rounded-xl border border-sky-400/50 bg-sky-400/10 px-3 py-3 text-center mb-3">
            <div className="text-3xl"><UiIcon name="hourglass" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></div>
            <p className="text-sky-200 font-bold">{t('signup.hostChecking')}</p>
            <p className="text-gray-300 text-sm">{t('quick.checkingHint')}</p>
          </div>
        )}
        {b.state === 'requested' && (
          <div className="rounded-xl border border-amber-300/50 bg-amber-300/10 px-3 py-3 text-center mb-1">
            <div className="text-3xl"><UiIcon name="search" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></div>
            <p className="text-amber-100 font-bold">{t('quick.requestedTitle')}</p>
            <p className="text-gray-300 text-sm">{t('quick.requestedHint')}</p>
          </div>
        )}
        {b.state === 'declined' && <p className="text-center text-red-300 mb-1">✕ {t('quick.declined')}</p>}
        {b.state === 'cancelled' && <p className="text-center text-yellow-300 mb-3">{t('quick.cancelled')}</p>}
        {b.state === 'ended' && (
          <div className="text-center">
            <div className="text-4xl"><UiIcon name="flag" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></div>
            <p className="text-white font-bold text-lg">{t('quick.endedTitle')}</p>
            <p className="text-gray-300 text-sm">{t('quick.endedHint')}</p>
            {b.review && !b.review.answered && <Link href={`/s/${b.review.token}`} className="btn-primary inline-block mt-3 px-8">{t('mybook.review')}</Link>}
            {b.review?.answered && <p className="text-lime-300 text-sm mt-2">✓ {t('mybook.reviewed')}</p>}
          </div>
        )}
        {(b.state === 'awaiting_proof' || b.state === 'rejected') && (
          <div className="flex flex-col gap-3 mb-3">
            <h2 className="text-white font-semibold">{t('signup.payTitle', { amount: formatVnd(b.amount) })}</h2>
            {b.state === 'rejected' && (
              <p className="rounded-lg border border-red-400/60 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {t('signup.rejected')}{b.payment_note ? `: ${b.payment_note}` : ''}
              </p>
            )}
            {b.hold_expires_at && <Countdown until={b.hold_expires_at} labelKey="countdown.hold" tone="sky" />}
            <p className="text-xs text-gray-400">{t('quick.holdRule')}</p>
            {b.payment && <PaymentCard payment={b.payment} />}
            <p className="text-white text-sm font-semibold">{t('signup.afterTransfer')}</p>
          </div>
        )}
        {(b.state === 'awaiting_proof' || b.state === 'rejected' || b.state === 'proof_submitted') && (
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
              <button type="button" className={`${b.state === 'proof_submitted' ? 'btn-secondary' : 'btn-primary'} w-full py-3`} onClick={() => file.current?.click()}>
                {b.state === 'proof_submitted' ? t('signup.replaceProof') : t('signup.uploadProof')}
              </button>
            )}
            {err && <p className="text-red-400 text-sm">{err}</p>}
          </div>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="text-white font-semibold mb-1">{t('quick.yourBooking')}</h2>
        <p className="text-gray-400 text-xs mb-2">
          {b.contact.full_name} · {b.contact.phone || t('quick.noPhoneShort')}
          {b.contact.dupr_level != null ? ` · ${t('quick.duprShort')} ${Number(b.contact.dupr_level).toFixed(2)}` : ''}
        </p>
        <ol className="flex flex-col divide-y divide-navy-700">
          {b.slots.map((s, i) => (
            <li key={i} className="py-2 text-sm flex items-center justify-between gap-2">
              <span className="text-gray-200 min-w-0 break-words">
                <span className="text-gray-500 w-6 inline-block">{i + 1}.</span>
                {s.full_name}
                {s.gender && <span className={`ml-2 text-[11px] ${s.gender === 'male' ? 'text-sky-300' : 'text-pink-300'}`}>{t(`members.${s.gender}`)}</span>}
                {s.dupr_level != null && <span className="ml-2 text-[11px] text-gray-400">{Number(s.dupr_level).toFixed(2)}</span>}
                {s.dupr_id && <span className="ml-2 text-[11px] text-sky-300 font-mono">DUPR {s.dupr_id}</span>}
              </span>
              <span className={`text-[11px] shrink-0 ${s.status === 'cancelled' ? 'text-gray-500' : s.status === 'pending' ? 'text-sky-300' : 'text-lime-300'}`}>{t(`quick.st_${s.status}`)}</span>
            </li>
          ))}
        </ol>
        <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-navy-700">
          <span className="text-gray-400 text-sm">{t('quick.total')}</span>
          <b className="text-white tabular-nums">{formatVnd(b.amount)}</b>
        </div>
        <p className="text-sky-200 text-xs mt-2">{t('quick.contactNote')}</p>
      </section>

      {b.host_contact && (
        <section className="card mb-4">
          <h2 className="text-white font-semibold">{t('quick.hostContactTitle')}</h2>
          <p className="text-gray-400 text-sm mt-0.5">{t('quick.hostContactHint')}</p>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
            <span className="text-gray-100 font-semibold">{b.host_contact.name || t('quick.theHost')} · <span className="tabular-nums">{b.host_contact.phone}</span></span>
            <a href={`tel:${b.host_contact.phone}`} className="btn-primary text-sm max-sm:w-full text-center">{t('quick.callHost')}</a>
          </div>
        </section>
      )}

      {b.state === 'confirmed' && (
        <div className="flex flex-col items-center gap-4 mb-4">
          {b.slots.filter((s) => s.ticket_code).map((s) => (
            <TicketCard key={s.ticket_code} ticketCode={s.ticket_code} name={s.full_name} checkedIn={s.status === 'checked_in'} />
          ))}
        </div>
      )}
      <p className="text-center text-gray-600 text-xs pb-4">{t('public.poweredBy')}</p>
    </div>
  );
}
