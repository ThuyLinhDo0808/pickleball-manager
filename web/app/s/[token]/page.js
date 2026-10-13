'use client';
import HomeLink from '@/components/HomeLink';
import Modal from '@/components/Modal';
import LevelInput from '@/components/LevelInput';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';

// After-session review everyone checked in gets by email / the player portal (no login).
// Overall stars, stars for the court and the organisation, did the level suit you, would
// you come back, a private note to the Host, and — guests only — "Do you want to join our
// fixed team?": yes leads to a short member form that lands in the club's waiting list.
export default function SurveyPage() {
  const { token } = useParams();
  const { t, lang, setLang } = useI18n();
  const { data, error, loading, setData } = useLoad(() => api.publicGet(`/api/public/surveys/${token}`), [token]);
  const [showJoin, setShowJoin] = useState(false);
  const [why, setWhy] = useState(false);
  const joinQ = (d) => t(d.community ? 'survey.joinCommunity' : 'survey.joinQuestion', { club: d.club_name || 'CLB' });

  const langToggle = (
    <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="text-xs text-gray-400 border border-navy-700 rounded-full px-3 py-1">
      {lang === 'vi' ? 'EN' : 'VI'}
    </button>
  );

  if (loading && !data) return <div className="min-h-screen flex items-center justify-center text-gray-400">{t('common.loading')}</div>;
  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-gray-300">{error?.status === 410 ? t('survey.closed') : error?.status === 404 || !error ? t('survey.notFound') : t('public.loadError')}</p>
        {langToggle}
      </div>
    );
  }

  const e = data.event;
  const time = hhmm(e.start_time);
  const update = (v) => (setData ? setData(v) : window.location.reload());

  return (
    <div className="min-h-screen max-w-md mx-auto px-4 pt-safe pb-safe-4">
      <header className="flex items-center justify-between py-4">
        <span className="text-lime-400 font-bold truncate">{data.club_name || t('appName')}</span>
        <div className="flex items-center gap-2">
          <HomeLink />
          {langToggle}
        </div>
      </header>
      <section className="card mb-4">
        <p className="text-gray-400 text-xs uppercase tracking-wide">{t('survey.kicker')}</p>
        <h1 className="text-white text-xl font-bold">{t('survey.thanks', { name: data.player_name })}</h1>
        <p className="text-gray-300 text-sm mt-1">
          {e.title} ·{' '}
          <span className="capitalize">{formatDay(e.event_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
          {time && ` · ${time}`}
          {e.location && ` · ${e.location}`}
        </p>
      </section>

      {!data.open && <p className="card text-gray-300 text-sm">{t('survey.notYet')}</p>}

      {data.open && !data.answer && <SurveyForm token={token} data={data} onDone={(v) => { update(v); if (v.answer?.wants_join) setShowJoin(true); }} />}

      {data.answer && (
        <section className="card mb-4 text-center">
          <div className="text-3xl">💚</div>
          <p className="text-white font-semibold mt-1">{t('survey.received')}</p>
          <p className="text-amber-300 text-lg tracking-widest mt-1" aria-label={`${data.answer.rating}/5`}>
            {'★'.repeat(data.answer.rating)}
            <span className="text-navy-600">{'★'.repeat(5 - data.answer.rating)}</span>
          </p>
        </section>
      )}

      {data.answer && !data.is_fixed && !data.join_requested && (
        <section className="card mb-4">
          {!showJoin ? (
            <>
              <p className="text-white font-semibold">{joinQ(data)}</p>
              {data.community && (
                <button type="button" className="text-lime-300 text-sm underline underline-offset-2 mt-1" onClick={() => setWhy(true)}>
                  💡 {t('survey.whyCta')}
                </button>
              )}
              <button type="button" className="btn-primary w-full mt-3 py-3" onClick={() => setShowJoin(true)}>
                {t('survey.joinCta')} →
              </button>
            </>
          ) : (
            <JoinForm token={token} data={data} onDone={update} />
          )}
        </section>
      )}

      {why && <JoinWhy data={data} onClose={() => setWhy(false)} onJoin={() => { setWhy(false); setShowJoin(true); }} />}

      {data.join_requested && (
        <section className="card mb-4 border-lime-400/50">
          <p className="text-lime-300 font-semibold">✓ {t('survey.joinSent')}</p>
          <p className="text-gray-300 text-sm mt-1">{t('survey.joinSentHint', { club: data.club_name || 'CLB' })}</p>
        </section>
      )}
    </div>
  );
}

// Communities: why join (shown from the invitation after the review). Only what the app
// really gives: the Top-month race and its prizes when the Host runs it, the community
// page, membership plans, and the Host's member perks.
function JoinWhy({ data, onClose, onJoin }) {
  const { t } = useI18n();
  const r = data.race;
  const prizes = r ? ['1', '2', '3'].filter((k) => r.rewards[k] !== 'none').map((k) => `Top ${k}: ${t(`race.reward_${r.rewards[k]}`)}`).join(' · ') : '';
  const items = [
    ...(r ? [['🏆', t('survey.why_race_t'), t('survey.why_race', { min: r.min_sessions })], ['🎁', t('survey.why_prize_t'), prizes]] : []),
    ['📅', t('survey.why_page_t'), t('survey.why_page')],
    ['🎫', t('survey.why_plan_t'), t('survey.why_plan')],
    ['⚡', t('survey.why_perk_t'), t('survey.why_perk')],
  ];
  return (
    <Modal open title={t('survey.whyTitle', { club: data.club_name || '' })} onClose={onClose}>
      <ul className="flex flex-col gap-3">
        {items.map(([icon, title, body]) => (
          <li key={title} className="flex gap-3">
            <span className="text-2xl leading-none" aria-hidden="true">{icon}</span>
            <span className="text-sm">
              <b className="text-white block">{title}</b>
              <span className="text-gray-300">{body}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 justify-end mt-5">
        <button type="button" className="btn-secondary text-sm" onClick={onClose}>{t('survey.joinLater')}</button>
        <button type="button" className="btn-primary text-sm" onClick={onJoin}>{t('survey.joinCta')} →</button>
      </div>
    </Modal>
  );
}

function Choice({ on, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm font-semibold ${on ? 'border-lime-400 bg-lime-400 text-navy-950' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}
    >
      {children}
    </button>
  );
}

// 1–5 stars. `optional`: tapping the chosen star again clears it.
function Stars({ value, onChange, size = 'text-3xl', label, optional }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}/5`}
          onClick={() => onChange(optional && value === n ? 0 : n)}
          className={`${size} leading-none px-1 ${n <= value ? 'text-amber-300' : 'text-navy-600 hover:text-navy-500'}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function SurveyForm({ token, data, onDone }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [court, setCourt] = useState(0);
  const [org, setOrg] = useState(0);
  const [back, setBack] = useState('');
  const [fit, setFit] = useState('');
  const [comment, setComment] = useState('');
  const [join, setJoin] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!rating) return setErr(t('survey.needStars'));
    setBusy(true);
    setErr('');
    try {
      onDone(await api.publicPost(`/api/public/surveys/${token}`, { rating, court_rating: court || null, organization_rating: org || null, come_back: back || null, level_fit: fit || null, comment, wants_join: join === true }));
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mb-4 flex flex-col gap-4">
      <div>
        <p className="text-white font-semibold">1. {t('survey.qStars')}</p>
        <div className="mt-2"><Stars value={rating} onChange={setRating} label={t('survey.qStars')} /></div>
      </div>
      <div>
        <p className="text-white font-semibold">2. {t('survey.qDetail')}</p>
        <div className="mt-2 flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-gray-300">🏟 {t('survey.qCourt')}</span>
            <Stars value={court} onChange={setCourt} size="text-2xl" label={t('survey.qCourt')} optional />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-gray-300">📋 {t('survey.qOrg')} <span className="text-gray-500 text-xs">({t('survey.qOrgHint')})</span></span>
            <Stars value={org} onChange={setOrg} size="text-2xl" label={t('survey.qOrg')} optional />
          </div>
        </div>
      </div>
      <div>
        <p className="text-white font-semibold">3. {t('survey.qLevel')}</p>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {['easy', 'right', 'hard'].map((k) => (
            <Choice key={k} on={fit === k} onClick={() => setFit(fit === k ? '' : k)}>
              {t(`survey.level_${k}`)}
            </Choice>
          ))}
        </div>
      </div>
      <div>
        <p className="text-white font-semibold">4. {t('survey.qComeBack')}</p>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {['yes', 'maybe', 'no'].map((k) => (
            <Choice key={k} on={back === k} onClick={() => setBack(back === k ? '' : k)}>
              {t(`survey.back_${k}`)}
            </Choice>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="survey-comment" className="text-white font-semibold">5. {t('survey.qComment')}</label>
        <p className="text-gray-500 text-xs mt-0.5">🔒 {t('survey.commentHint')}</p>
        <textarea id="survey-comment" className="input mt-2 min-h-[5rem]" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('survey.commentPlaceholder')} />
      </div>
      {!data.is_fixed && (
        <div>
          <p className="text-white font-semibold">6. {t(data.community ? 'survey.joinCommunity' : 'survey.joinQuestion', { club: data.club_name || 'CLB' })}</p>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Choice on={join === true} onClick={() => setJoin(true)}>{t('survey.joinYes')}</Choice>
            <Choice on={join === false} onClick={() => setJoin(false)}>{t('survey.joinLater')}</Choice>
          </div>
        </div>
      )}
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <button className="btn-primary py-3" disabled={busy}>{t('survey.send')}</button>
    </form>
  );
}

function JoinForm({ token, data, onDone }) {
  const { t } = useI18n();
  const p = data.prefill || {};
  const [f, setF] = useState({
    full_name: p.full_name || '',
    phone: p.phone || '',
    gender: p.gender || '',
    birth_date: p.birth_date || '',
    dupr_level: p.dupr_level ?? '',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      onDone(await api.publicPost(`/api/public/surveys/${token}/join`, f));
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-white font-semibold">{t('survey.joinFormTitle', { club: data.club_name || 'CLB' })}</p>
      <div>
        <label htmlFor="j-name" className="text-xs text-gray-400">{t('common.name')} *</label>
        <input id="j-name" className="input" required value={f.full_name} onChange={(e) => set({ full_name: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label htmlFor="j-phone" className="text-xs text-gray-400">{t('common.phone')} *</label>
          <input id="j-phone" className="input" required inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div className="min-w-0">
          <label htmlFor="j-gender" className="text-xs text-gray-400">{t('members.gender')}</label>
          <select id="j-gender" className="input" value={f.gender} onChange={(e) => set({ gender: e.target.value })}>
            <option value="">—</option>
            <option value="male">{t('members.male')}</option>
            <option value="female">{t('members.female')}</option>
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="j-birth" className="text-xs text-gray-400">{t('members.birthDate')} *</label>
          <input id="j-birth" className="input" type="date" required value={f.birth_date} onChange={(e) => set({ birth_date: e.target.value })} />
        </div>
        <div className="min-w-0">
          <label htmlFor="j-dupr" className="text-xs text-gray-400">{t('common.level')}</label>
          <LevelInput id="j-dupr" sport={data.sport} value={f.dupr_level} onChange={(v) => set({ dupr_level: v })} />
        </div>
      </div>
      <div>
        <label htmlFor="j-note" className="text-xs text-gray-400">{t('survey.joinNote')}</label>
        <textarea id="j-note" className="input min-h-[4rem]" maxLength={1000} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder={t('survey.joinNotePlaceholder')} />
      </div>
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <button className="btn-primary py-3" disabled={busy}>{t('survey.joinSubmit')}</button>
    </form>
  );
}
