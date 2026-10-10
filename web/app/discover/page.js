'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import PlayerShell from '@/components/PlayerShell';
import ClubAvatar from '@/components/ClubAvatar';
import { useI18n } from '@/context/I18nContext';
import { api, clubImage } from '@/lib/api';
import { formatDay } from '@/lib/dates';
import { COUNTRIES, PROVINCES, VIETNAM } from '@/lib/regions';

const EMPTY = { q: '', country: '', province: '', district: '', sport: '' };

// One club in the results: cover strip, avatar, where / when, members, next session.
function ClubCard({ c }) {
  const { t, lang } = useI18n();
  const cover = clubImage(c.id, 'cover', c.cover_version);
  return (
    <Link href={`/discover/${c.id}`} className="group overflow-hidden rounded-2xl border border-navy-700 bg-navy-900/70 hover:border-lime-400/60 transition flex flex-col">
      <div className="relative h-24 bg-gradient-to-br from-navy-800 via-navy-900 to-lime-900/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover && <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />}
        <span className="absolute -bottom-6 left-3">
          <ClubAvatar id={c.id} name={c.name} sport={c.sport} size={52} img={clubImage(c.id, 'avatar', c.avatar_version)} ring="ring-2 ring-navy-950" />
        </span>
      </div>
      <div className="p-3 pt-8 flex-1 flex flex-col">
        <p className="text-white font-bold leading-snug group-hover:text-lime-300">{c.name}</p>
        <p className="text-gray-400 text-xs mt-0.5">📍 {[c.district, c.province, c.country !== VIETNAM ? c.country : null].filter(Boolean).join(', ') || '—'}</p>
        {c.schedule && <p className="text-gray-300 text-xs mt-1 line-clamp-1">🗓 {c.schedule}</p>}
        {c.description && <p className="text-gray-400 text-xs mt-1 line-clamp-2">{c.description}</p>}
        <div className="mt-auto pt-2 flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-full bg-navy-700 px-2 py-0.5 text-gray-200">👥 {t('disc.members', { n: c.member_count ?? c.member_count_hint ?? 0 })}</span>
          {c.upcoming > 0 ? (
            <span className="rounded-full bg-lime-400/15 px-2 py-0.5 text-lime-200">📅 {t('disc.nextOn', { n: c.upcoming, date: formatDay(c.next_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit' }) })}</span>
          ) : (
            <span className="rounded-full bg-navy-800 px-2 py-0.5 text-gray-500">{t('disc.noUpcoming')}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

// Find a club: by name / place, country, province or city, district, sport. Open to
// everyone; asking to join needs an account.
export default function DiscoverPage() {
  const { t } = useI18n();
  const [f, setF] = useState(EMPTY);
  const [applied, setApplied] = useState(null);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async (filters, p = 1) => {
    setBusy(true);
    setError('');
    try {
      const qs = new URLSearchParams(Object.entries({ ...filters, page: p }).filter(([, v]) => v !== '' && v != null));
      const r = await api.publicGet(`/api/public/discover/clubs?${qs}`);
      setItems((x) => (p === 1 ? r.items : [...x, ...r.items]));
      setMore(r.more);
      setPage(p);
      setApplied(filters);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  // Start from the address bar (?q=… from the home page search box).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const start = { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, sp.get(k) || ''])) };
    setF(start);
    run(start);
  }, [run]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, ...(k === 'country' ? { province: '' } : {}) }));
  function submit(e) {
    e.preventDefault();
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    window.history.replaceState(null, '', `/discover${qs.toString() ? `?${qs}` : ''}`);
    run(f);
  }
  const vn = !f.country || f.country === VIETNAM;
  const filtered = applied && Object.values(applied).some(Boolean);

  return (
    <PlayerShell requireAuth={false}>
      <h1 className="text-white text-2xl font-bold">{t('disc.title')}</h1>
      <p className="text-gray-400 text-sm mb-4">{t('disc.lead')}</p>

      <form onSubmit={submit} className="card !p-3 mb-4 flex flex-col gap-2" role="search">
        <div className="flex gap-2">
          <input className="input flex-1 min-w-0" value={f.q} onChange={set('q')} placeholder={t('disc.qPh')} aria-label={t('disc.qPh')} />
          <button className="btn-primary shrink-0" disabled={busy}>🔍 {t('disc.search')}</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select className="input text-sm" value={f.country} onChange={set('country')} aria-label={t('creq.country')}>
            <option value="">{t('disc.anyCountry')}</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {vn ? (
            <select className="input text-sm" value={f.province} onChange={set('province')} aria-label={t('creq.province')}>
              <option value="">{t('disc.anyProvince')}</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <input className="input text-sm" value={f.province} onChange={set('province')} placeholder={t('creq.province')} aria-label={t('creq.province')} />
          )}
          <input className="input text-sm" value={f.district} onChange={set('district')} placeholder={t('disc.districtPh')} aria-label={t('creq.district')} />
          <select className="input text-sm" value={f.sport} onChange={set('sport')} aria-label={t('creq.sport')}>
            <option value="">{t('disc.anySport')}</option>
            <option value="pickleball">🏓 {t('onb.sport_pickleball')}</option>
            <option value="badminton">🏸 {t('onb.sport_badminton')}</option>
          </select>
        </div>
        {filtered && (
          <button type="button" className="self-start text-gray-400 hover:text-white underline text-xs" onClick={() => { setF(EMPTY); window.history.replaceState(null, '', '/discover'); run(EMPTY); }}>
            ✕ {t('disc.clear')}
          </button>
        )}
      </form>

      {error && <p className="card text-red-300 text-sm mb-3">{error}</p>}
      {!applied && busy && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {applied && items.length === 0 && !busy && (
        <div className="card text-center py-8">
          <div className="text-4xl mb-2" aria-hidden="true">🔎</div>
          <p className="text-gray-300 text-sm">{t('disc.none')}</p>
          <p className="text-gray-500 text-xs mt-1">{t('disc.noneHint')}</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => <ClubCard key={c.id} c={c} />)}
      </div>
      {more && (
        <button type="button" className="btn-secondary w-full mt-4" disabled={busy} onClick={() => run(applied, page + 1)}>
          {busy ? t('common.loading') : t('disc.more')}
        </button>
      )}
      <p className="text-gray-500 text-xs mt-6 text-center">
        {t('disc.ownClub')} <Link href="/club-request" className="text-lime-300 underline">{t('disc.ownClubLink')}</Link>
      </p>
    </PlayerShell>
  );
}
