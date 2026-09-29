'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const emptyForm = { full_name: '', phone: '', dupr_level: '' };

function locale(lang) {
  return lang === 'vi' ? 'vi-VN' : 'en-GB';
}

function formatDate(ymd, lang) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(lang), { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(t) {
  return t ? t.slice(0, 5) : '';
}

function Info({ label, value }) {
  return (
    <div className="bg-navy-900 rounded-lg px-3 py-2">
      <div className="text-gray-400 text-xs">{label}</div>
      <div className="text-white font-semibold text-sm">{value}</div>
    </div>
  );
}

// Player-facing page opened from the link the Host posts in Zalo/Telegram. No login.
export default function PublicEventPage() {
  const { token } = useParams();
  const { t, lang, setLang } = useI18n();
  const { data: ev, error, loading, reload } = useLoad(() => api.publicGet(`/api/events/public/${token}`), [token]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState(null);
  const { user } = useAuth();

  // Signed-in players: prefill from their profile; the sign-up then shows in their history.
  useEffect(() => {
    if (!user) return;
    api
      .get('/api/player/me')
      .then((me) => {
        const p = me.profile;
        if (p) setForm((f) => ({ full_name: f.full_name || p.full_name, phone: f.phone || p.phone || '', dupr_level: f.dupr_level || (p.dupr_level ?? '') }));
      })
      .catch(() => {});
  }, [user?.id]);

  async function register(e) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const send = user ? api.post : api.publicPost; // token attached when signed in
      const res = await send(`/api/events/public/${token}/register`, {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        dupr_level: form.dupr_level === '' ? null : Number(form.dupr_level),
      });
      setResult(res);
      setForm(emptyForm);
      reload();
    } catch (err) {
      if (err.status === 409) setFormError(t('public.duplicate'));
      else if (err.status === 403) reload(); // deadline passed meanwhile — page re-renders as closed
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const langToggle = (
    <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="text-xs text-gray-400 border border-navy-700 rounded-full px-3 py-1">
      {lang === 'vi' ? 'EN' : 'VI'}
    </button>
  );

  if (loading && !ev) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">{t('common.loading')}</div>;
  }
  if (error || !ev) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-gray-300">{t('public.notFound')}</p>
        {langToggle}
      </div>
    );
  }

  const spotsLeft = Math.max(ev.slots - ev.main_count, 0);
  const main = ev.participants.filter((p) => p.status !== 'waitlisted');
  const waitlist = ev.participants.filter((p) => p.status === 'waitlisted');
  const level =
    ev.level_min || ev.level_max ? [ev.level_min ?? '…', ev.level_max ?? '…'].join(' – ') : t('public.anyLevel');
  const time = [formatTime(ev.start_time), formatTime(ev.end_time)].filter(Boolean).join(' – ');

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 pt-safe pb-safe-4">
      <header className="flex items-center justify-between py-4">
        <span className="text-lime-400 font-bold">{ev.club_name || t('appName')}</span>
        {langToggle}
      </header>

      <section className="card mb-4">
        <h1 className="text-white text-2xl font-bold leading-tight">{ev.title}</h1>
        <p className="text-lime-400 text-sm mt-1 capitalize">
          {formatDate(ev.event_date, lang)}
          {time && ` · ${time}`}
        </p>
        {ev.location && <p className="text-gray-300 text-sm mt-1">📍 {ev.location}</p>}

        <div className="grid grid-cols-2 gap-2 mt-4">
          <Info label={t('public.fee')} value={Number(ev.fee_amount) ? `${Number(ev.fee_amount).toLocaleString('vi-VN')} ₫` : t('public.free')} />
          <Info label={t('public.level')} value={level} />
          <Info label={t('events.courts')} value={ev.courts} />
          <Info label={t('events.slots')} value={`${ev.main_count}/${ev.slots}`} />
        </div>
      </section>

      {ev.notice && (
        <section className="card mb-4 border-lime-400/40">
          <h2 className="text-lime-400 text-xs font-semibold uppercase tracking-wide mb-1">{t('public.hostNotice')}</h2>
          <p className="text-gray-200 text-sm whitespace-pre-line">{ev.notice}</p>
        </section>
      )}

      <section className="card mb-4">
        {result ? (
          <div className="text-center py-2">
            <div className="text-4xl mb-2">{result.status === 'waitlisted' ? '⏳' : '🎉'}</div>
            <p className="text-white font-semibold">{result.full_name}</p>
            <p className="text-gray-300 text-sm mt-1">
              {result.status === 'waitlisted' ? t('public.successWait') : t('public.successMain')}
            </p>
            {ev.registration_open && (
              <button className="btn-secondary mt-4 w-full" onClick={() => setResult(null)}>
                {t('public.registerAnother')}
              </button>
            )}
          </div>
        ) : ev.registration_open ? (
          <form onSubmit={register} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-white font-semibold">{t('public.register')}</h2>
              <span className={`text-xs ${spotsLeft ? 'text-lime-400' : 'text-yellow-400'}`}>
                {spotsLeft ? t('public.spotsLeft', { n: spotsLeft }) : t('public.full')}
              </span>
            </div>
            {ev.registration_deadline && (
              <p className="text-gray-400 text-xs -mt-2">
                {t('public.deadlineIn', { date: new Date(ev.registration_deadline).toLocaleString(locale(lang), { dateStyle: 'short', timeStyle: 'short' }) })}
              </p>
            )}
            <div>
              <label className="text-xs text-gray-400">{t('public.yourName')}</label>
              <input className="input" required autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-400">{t('public.yourPhone')}</label>
              <input className="input" required type="tel" inputMode="tel" autoComplete="tel" minLength={9} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <p className="text-gray-500 text-xs mt-1">{t('public.phoneHint')}</p>
            </div>
            <div>
              <label className="text-xs text-gray-400">{t('public.yourLevel')}</label>
              <input className="input" type="number" inputMode="decimal" step="0.01" min="1" max="8" value={form.dupr_level} onChange={(e) => setForm({ ...form, dupr_level: e.target.value })} />
            </div>
            {formError && <p className="text-red-400 text-sm">{formError}</p>}
            <button className="btn-primary w-full py-3 text-base" disabled={busy}>
              {t('public.submit')}
            </button>
          </form>
        ) : (
          <p className="text-yellow-400 text-sm text-center py-2">🔒 {t(`public.closed_${ev.closed_code}`)}</p>
        )}
      </section>

      <section className="card mb-6">
        <h2 className="text-white font-semibold mb-2">
          {t('public.players')} <span className="text-gray-400 font-normal">({main.length}/{ev.slots})</span>
        </h2>
        {main.length === 0 && <p className="text-gray-400 text-sm">{t('public.nobody')}</p>}
        <ol className="flex flex-col divide-y divide-navy-700">
          {main.map((p, i) => (
            <li key={i} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-200">
                <span className="text-gray-500 w-6 inline-block">{i + 1}.</span>
                {p.full_name}
              </span>
              {p.dupr_level != null && <span className="text-gray-400 text-xs">{p.dupr_level}</span>}
            </li>
          ))}
        </ol>
        {waitlist.length > 0 && (
          <>
            <h3 className="text-gray-300 text-sm font-semibold mt-4 mb-1">
              {t('events.waitlist')} ({waitlist.length})
            </h3>
            <ol className="flex flex-col divide-y divide-navy-700">
              {waitlist.map((p, i) => (
                <li key={i} className="py-2 text-sm text-gray-400">
                  <span className="text-gray-500 w-6 inline-block">{i + 1}.</span>
                  {p.full_name}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <p className="text-center text-gray-600 text-xs pb-4">{t('public.poweredBy')}</p>
    </div>
  );
}
