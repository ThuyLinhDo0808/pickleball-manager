'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import HomeLink from '@/components/HomeLink';
import MapLink from '@/components/MapLink';
import LevelInput from '@/components/LevelInput';
import Countdown from '@/components/Countdown';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { formatDay, hhmm } from '@/lib/dates';
import { eventLevelText } from '@/lib/levels';

const blankSlot = () => ({ full_name: '', gender: '', dupr_level: '', dupr_id: '' });
const idChars = (v) => v.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 10);

// Quick booking from the Host's invite link (it changes every 30 s): no account. Contact
// details, then how many players and who they are; the total is transferred on the next page.
export default function QuickBookPage() {
  const { eventId, code } = useParams();
  const router = useRouter();
  const { t, lang, setLang } = useI18n();
  const [opened, setOpened] = useState(null); // { pass, pass_expires_at, event }
  const [openErr, setOpenErr] = useState(null);
  const [contact, setContact] = useState({ full_name: '', phone: '', dupr_level: '', dupr_id: '' });
  const [slots, setSlots] = useState([blankSlot()]);
  const [meFirst, setMeFirst] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .publicPost(`/api/public/quick/${eventId}/open`, { code })
      .then(setOpened)
      .catch(setOpenErr);
  }, [eventId, code]);

  const langToggle = (
    <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="text-xs text-gray-400 border border-navy-700 rounded-full px-3 py-1">
      {lang === 'vi' ? 'EN' : 'VI'}
    </button>
  );
  const shell = (body) => (
    <div className="min-h-screen max-w-lg mx-auto px-4 pt-safe pb-safe-4">
      <header className="flex items-center justify-between py-4">
        <span className="text-lime-400 font-bold truncate">{opened?.event?.club_name || t('appName')}</span>
        <div className="flex items-center gap-2">
          <HomeLink />
          {langToggle}
        </div>
      </header>
      {body}
    </div>
  );

  if (openErr) {
    const code = openErr.payload?.code;
    return shell(
      <div className="card text-center py-8">
        <div className="text-4xl mb-2">{code === 'link_expired' ? '⌛' : '🔒'}</div>
        <p className="text-white font-semibold">{t(code === 'link_expired' ? 'quick.expiredTitle' : code === 'not_open' || code === 'deadline' ? 'quick.closedTitle' : 'public.notFound')}</p>
        {code === 'link_expired' && <p className="text-gray-400 text-sm mt-1">{t('quick.expiredHint')}</p>}
      </div>
    );
  }
  if (!opened) return <div className="min-h-screen flex items-center justify-center text-gray-400">{t('common.loading')}</div>;

  const ev = opened.event;
  const max = Math.max(0, Math.min(ev.free_places, ev.max_slots));
  const time = [hhmm(ev.start_time), hhmm(ev.end_time)].filter(Boolean).join(' – ');
  const level = eventLevelText(ev, ev.sport, t) || t('public.anyLevel');
  // Slot 1 = the person booking (same name / level), unless they book for others only.
  const rows = slots.map((s, i) => (i === 0 && meFirst ? { ...s, full_name: contact.full_name, dupr_level: contact.dupr_level, dupr_id: contact.dupr_id } : s));
  const total = ev.fee * rows.length;
  const setSlot = (i, patch) => setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setCount = (n) => setSlots(Array.from({ length: n }, (_, i) => slots[i] || blankSlot()));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.publicPost(`/api/public/quick/${eventId}/book`, { pass: opened.pass, contact, slots: rows });
      try {
        window.localStorage.setItem(`pb_quick_${eventId}`, r.token);
      } catch {
        /* private mode: the booking page link still works */
      }
      router.replace(`/g/b/${r.token}`);
    } catch (err) {
      const p = err.payload || {};
      setError(p.code === 'not_enough_places' ? t('quick.notEnough', { n: p.free ?? 0 }) : p.code === 'pass_expired' ? t('quick.passExpired') : p.code === 'club_blocked' || p.code === 'club_suspended' ? t('quick.blocked') : p.code === 'bad_dupr_id' ? t('dupr.idOptional') : err.message);
    } finally {
      setBusy(false);
    }
  }

  return shell(
    <>
      <section className="card mb-4">
        <h1 className="text-white text-2xl font-bold leading-tight">{ev.title}</h1>
        <p className="text-lime-400 text-sm mt-1 capitalize">
          {formatDay(ev.event_date, lang, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          {time && ` · ${time}`}
        </p>
        {(ev.location || ev.map_url) && <p className="mt-1"><MapLink location={ev.location} mapUrl={ev.map_url} /></p>}
        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <div className="bg-navy-900 rounded-lg px-2 py-2"><div className="text-gray-400 text-xs">{t('public.fee')}</div><div className="text-white font-semibold text-sm">{ev.fee ? formatVnd(ev.fee) : t('public.free')}</div></div>
          <div className="bg-navy-900 rounded-lg px-2 py-2"><div className="text-gray-400 text-xs">{t('public.level')}</div><div className="text-white font-semibold text-sm">{level}</div></div>
          <div className="bg-navy-900 rounded-lg px-2 py-2"><div className="text-gray-400 text-xs">{t('quick.freePlaces')}</div><div className="text-white font-semibold text-sm">{ev.free_places}</div></div>
        </div>
      </section>

      {max === 0 ? (
        <p className="card text-center text-yellow-300">{t('quick.full')}</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Countdown until={opened.pass_expires_at} labelKey="quick.formLeft" tone="sky" />
          <section className="card">
            <h2 className="text-white font-semibold mb-1">1. {t('quick.contactTitle')}</h2>
            <p className="rounded-lg border border-sky-400/40 bg-sky-400/5 px-3 py-2 text-xs text-sky-200 mb-3">📞 {t('quick.contactNote')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-400" htmlFor="q-name">{t('quick.fullName')} *</label>
                <input id="q-name" className="input" required maxLength={120} autoComplete="name" value={contact.full_name} onChange={(e) => setContact({ ...contact, full_name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400" htmlFor="q-phone">{t('quick.phone')} *</label>
                <input id="q-phone" className="input" required type="tel" inputMode="tel" maxLength={20} autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400" htmlFor="q-level">{t(ev.sport === 'badminton' ? 'quick.levelBadminton' : 'quick.duprSelf')}</label>
                <LevelInput id="q-level" sport={ev.sport} value={contact.dupr_level} onChange={(v) => setContact({ ...contact, dupr_level: v })} placeholder="3.25" />
              </div>
              {ev.sport !== 'badminton' && (
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-400" htmlFor="q-dupr">{t('quick.duprId')}</label>
                  <input id="q-dupr" className="input uppercase tracking-wider font-mono placeholder:normal-case placeholder:tracking-normal placeholder:font-sans" maxLength={10} autoCapitalize="characters" autoComplete="off" placeholder={t('quick.duprIdPh')} value={contact.dupr_id} onChange={(e) => setContact({ ...contact, dupr_id: idChars(e.target.value) })} />
                  <p className="text-gray-400 text-xs mt-1">ℹ️ {t('quick.duprIdNote')}</p>
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-white font-semibold">2. {t('quick.slotsTitle')}</h2>
              <div className="flex items-center gap-2" role="group" aria-label={t('quick.slotsTitle')}>
                <button type="button" className="btn-secondary !px-3" disabled={slots.length <= 1} onClick={() => setCount(slots.length - 1)} aria-label="−">−</button>
                <span className="text-white font-bold tabular-nums w-6 text-center">{slots.length}</span>
                <button type="button" className="btn-secondary !px-3" disabled={slots.length >= max} onClick={() => setCount(slots.length + 1)} aria-label="+">+</button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-200 mb-3">
              <input type="checkbox" checked={meFirst} onChange={(e) => setMeFirst(e.target.checked)} />
              {t('quick.meFirst')}
            </label>
            <ol className="flex flex-col gap-3">
              {rows.map((s, i) => {
                const mine = i === 0 && meFirst;
                return (
                  <li key={i} className="rounded-lg bg-navy-900 p-3">
                    <p className="text-xs text-gray-400 mb-2">{t('quick.slotN', { n: i + 1 })}{mine ? ` · ${t('quick.you')}` : ''}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_7rem_6rem] gap-2">
                      <input className="input" required maxLength={120} placeholder={t('quick.fullName')} aria-label={t('quick.fullName')} value={s.full_name} disabled={mine} onChange={(e) => setSlot(i, { full_name: e.target.value })} />
                      <select className="input" value={s.gender} aria-label={t('quick.gender')} onChange={(e) => setSlot(i, { gender: e.target.value })}>
                        <option value="">{t('quick.gender')}</option>
                        <option value="male">{t('members.male')}</option>
                        <option value="female">{t('members.female')}</option>
                      </select>
                      {mine ? (
                        <input className="input" disabled value={s.dupr_level || '—'} aria-label={t('quick.level')} />
                      ) : (
                        <LevelInput sport={ev.sport} value={s.dupr_level} onChange={(v) => setSlot(i, { dupr_level: v })} placeholder={t('quick.level')} />
                      )}
                    </div>
                    {ev.sport !== 'badminton' && !mine && (
                      <input className="input mt-2 uppercase tracking-wider font-mono text-sm placeholder:normal-case placeholder:tracking-normal placeholder:font-sans" maxLength={10} autoCapitalize="characters" autoComplete="off" placeholder={t('quick.duprIdSlot')} aria-label={t('quick.duprIdSlot')} value={s.dupr_id} onChange={(e) => setSlot(i, { dupr_id: idChars(e.target.value) })} />
                    )}
                  </li>
                );
              })}
            </ol>
            {max < ev.max_slots && <p className="text-gray-500 text-xs mt-2">{t('quick.maxHint', { n: max })}</p>}
          </section>

          <section className="card">
            <div className="flex items-baseline justify-between">
              <span className="text-gray-300 text-sm">{t('quick.totalLabel', { n: rows.length, fee: formatVnd(ev.fee) })}</span>
              <b className="text-lime-300 text-xl tabular-nums">{formatVnd(total)}</b>
            </div>
            <p className="text-gray-500 text-xs mt-1">{ev.fee ? t('quick.holdNote') : t('quick.freeNote')}</p>
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            <button className="btn-primary w-full py-3 mt-3" disabled={busy}>{busy ? '…' : ev.fee ? t('quick.toPay') : t('quick.book')}</button>
          </section>
        </form>
      )}
      <p className="text-center text-gray-600 text-xs py-4">{t('public.poweredBy')}</p>
    </>
  );
}
