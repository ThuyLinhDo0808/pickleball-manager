'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { formatDay } from '@/lib/dates';
import { dmy } from '@/lib/coach';

const Stars = ({ n, className = '' }) => (
  <span className={`text-amber-200 tracking-tight ${className}`} aria-label={`${n}/5`}>
    {'★'.repeat(n)}
    <span className="text-gray-600">{'★'.repeat(5 - n)}</span>
  </span>
);

// "★ 4.8 · 12 đánh giá" under the coach's name.
export function RatingLine({ rating, count }) {
  const { t } = useI18n();
  if (rating == null) return <p className="text-gray-500 text-xs mt-1">{t('creview.noneYet')}</p>;
  return <p className="text-amber-200 text-sm mt-1 tabular-nums">★ {rating} <span className="text-gray-400">· {t('creview.count', { n: count })}</span></p>;
}

// Book a 1-1 lesson in the coach's open hours: pick a day, then a free time.
export function BookOneOnOne({ slug }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { data: times, reload } = useLoad(() => api.publicGet(`/api/public/coach/${slug}/times`).catch(() => []), [slug]);
  const days = useMemo(() => [...new Set((times || []).map((x) => x.date))], [times]);
  const [day, setDay] = useState(null);
  const [pick, setPick] = useState(null);
  const [f, setF] = useState({ pay_mode: 'per_session', note: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState('');
  if (!times || !times.length) return null;
  const d = day || days[0];
  const list = times.filter((x) => x.date === d);
  async function book(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api.post(`/api/player/coach/coaches/${slug}/book`, { date: pick.date, start_time: pick.start_time, pay_mode: pick.price > 0 ? f.pay_mode : 'package', note: f.note.trim() || null });
      setDone(true);
      reload();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card mb-4">
      <h2 className="text-white font-semibold">{t('cbook.title')}</h2>
      <p className="text-gray-400 text-xs mb-2">{t('cbook.lead')}</p>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {days.map((x) => (
          <button key={x} type="button" aria-pressed={x === d} onClick={() => setDay(x)} className={`shrink-0 rounded-lg px-3 min-h-[44px] text-sm capitalize tabular-nums ${x === d ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-navy-800 text-gray-300'}`}>
            {formatDay(x, lang, { weekday: 'short', day: '2-digit', month: '2-digit' })}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {list.map((x) => (
          <button key={x.start_time} type="button" onClick={() => { setPick(x); setDone(false); setMsg(''); }} className="rounded-lg border border-navy-600 hover:border-lime-400 px-3 min-h-[44px] text-sm text-white tabular-nums">
            {x.start_time}
            <span className="block text-[10px] text-gray-400">{x.duration_min}′{x.price ? ` · ${formatVnd(x.price)}` : ''}</span>
          </button>
        ))}
      </div>
      <Modal open={!!pick} title={t('cbook.confirmTitle')} onClose={() => setPick(null)}>
        {pick && (
          done ? (
            <div className="grid gap-3">
              <p className="text-lime-300">{t('cbook.sent')}</p>
              <div className="flex justify-end gap-2">
                <Link href="/p/activity#my-coach" className="btn-secondary">{t('cbook.seeMine')}</Link>
                <button type="button" className="btn-primary" onClick={() => setPick(null)}>{t('common.close')}</button>
              </div>
            </div>
          ) : !user ? (
            <div className="grid gap-3">
              <p className="text-gray-300 text-sm">{t('cbook.signInFirst')}</p>
              <div className="flex justify-end"><Link href={`/sign-in?next=${encodeURIComponent(`/coach/${slug}`)}`} className="btn-primary">{t('cbook.signIn')}</Link></div>
            </div>
          ) : (
            <form onSubmit={book} className="grid gap-3">
              <p className="text-white capitalize tabular-nums">{formatDay(pick.date, lang, { weekday: 'long', day: '2-digit', month: '2-digit' })} · {pick.start_time} · {pick.duration_min}′{pick.court_name ? ` · ${pick.court_name}` : ''}</p>
              {pick.price > 0 && (
                <div>
                  <label className="text-xs text-gray-400">{t('coach.suPay')}</label>
                  <select className="input" value={f.pay_mode} onChange={(e) => setF({ ...f, pay_mode: e.target.value })}>
                    <option value="per_session">{t('cbook.payPerLesson', { price: formatVnd(pick.price) })}</option>
                    <option value="package">{t('coach.pay_package')}</option>
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-400">{t('cbook.note')}</label>
                <input className="input" maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={t('cbook.notePh')} />
              </div>
              <p className="text-gray-500 text-xs">{t('cbook.waitHint')}</p>
              {msg && <p className="text-red-300 text-sm">{msg}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setPick(null)}>{t('common.cancel')}</button>
                <button className="btn-primary" disabled={busy}>{t('cbook.send')}</button>
              </div>
            </form>
          )
        )}
      </Modal>
    </section>
  );
}

// Reviews on the public page, with "Viết đánh giá" for a student who was there at least once.
export function Reviews({ slug, reviews = [], rating, count }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: me, reload } = useLoad(() => (user ? api.get(`/api/player/coach/coaches/${slug}/me`).catch(() => null) : Promise.resolve(null)), [user?.id, slug]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [reported, setReported] = useState(false);
  const form = f || { stars: me?.review?.stars || 5, body: me?.review?.body || '' };
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api.post(`/api/player/coach/coaches/${slug}/review`, { stars: form.stars, body: form.body.trim() || null });
      setOpen(false);
      reload();
      window.location.reload();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function report(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api.post(`/api/player/coach/coaches/${slug}/report`, { reason: reason.trim() });
      setReported(true);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-white font-semibold">{t('creview.title')} {rating != null && <span className="text-amber-200 font-normal text-sm tabular-nums">★ {rating} · {t('creview.count', { n: count })}</span>}</h2>
        {me?.can_review && <button type="button" className="btn-secondary text-sm" onClick={() => { setF(null); setOpen(true); }}>{me.review ? t('creview.edit') : t('creview.write')}</button>}
      </div>
      {!reviews.length && <p className="text-gray-500 text-sm">{t('creview.empty')}</p>}
      <ul className="grid gap-2">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-lg border border-navy-700 px-3 py-2 text-sm">
            <div className="flex items-center gap-2"><Stars n={r.stars} /><span className="text-gray-300">{r.name || '—'}</span><span className="text-gray-500 text-xs tabular-nums ml-auto">{dmy(r.created_at?.slice(0, 10))}</span></div>
            {r.body && <p className="text-gray-200 mt-1 whitespace-pre-line break-words">{r.body}</p>}
          </li>
        ))}
      </ul>
      {user && (
        <div className="flex justify-end mt-2">
          <button type="button" className="text-gray-500 hover:text-gray-300 text-xs underline min-h-[44px] px-1" onClick={() => { setReporting(true); setReported(false); setMsg(''); }}>{t('creport.link')}</button>
        </div>
      )}
      <Modal open={open} title={t('creview.write')} onClose={() => setOpen(false)}>
        {open && (
          <form onSubmit={save} className="grid gap-3">
            <div className="flex gap-1" role="radiogroup" aria-label={t('creview.stars')}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={form.stars === n} onClick={() => setF({ ...form, stars: n })} className={`w-11 h-11 rounded-lg text-2xl ${n <= form.stars ? 'text-amber-300' : 'text-gray-600'}`}>★</button>
              ))}
            </div>
            <textarea className="input min-h-[5rem]" maxLength={1000} placeholder={t('creview.bodyPh')} value={form.body} onChange={(e) => setF({ ...form, body: e.target.value })} />
            <p className="text-gray-500 text-xs">{t('creview.publicHint')}</p>
            {msg && <p className="text-red-300 text-sm">{msg}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
              <button className="btn-primary" disabled={busy}>{t('common.save')}</button>
            </div>
          </form>
        )}
      </Modal>
      <Modal open={reporting} title={t('creport.title')} onClose={() => setReporting(false)}>
        {reporting && (reported ? (
          <div className="grid gap-3">
            <p className="text-lime-300 text-sm">{t('creport.sent')}</p>
            <div className="flex justify-end"><button type="button" className="btn-primary" onClick={() => setReporting(false)}>{t('common.close')}</button></div>
          </div>
        ) : (
          <form onSubmit={report} className="grid gap-3">
            <p className="text-gray-300 text-sm">{t('creport.lead')}</p>
            <textarea className="input min-h-[5rem]" required minLength={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
            {msg && <p className="text-red-300 text-sm">{msg}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setReporting(false)}>{t('common.cancel')}</button>
              <button className="btn-primary" disabled={busy}>{t('creport.send')}</button>
            </div>
          </form>
        ))}
      </Modal>
    </section>
  );
}
