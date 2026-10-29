'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Segmented from '@/components/ui/Segmented';
import UiIcon from '@/components/ui/UiIcon';
import { Avatar } from '@/components/PlayerChip';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

// Tìm → Coach: public coach profiles, best rated first; filter by sport, name / area.
// Before Coach Manager is on for everyone only beta testers (signed in) see results.
export default function CoachFind() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [sport, setSport] = useState('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async (nextSport, nextQ) => {
    setBusy(true);
    setError('');
    const qs = new URLSearchParams(Object.entries({ sport: nextSport === 'all' ? '' : nextSport, q: nextQ.trim() }).filter(([, v]) => v));
    try {
      let list = await api.publicGet(`/api/public/coach?${qs}`);
      if (!list.length && user) list = await api.get(`/api/player/coach/search?${qs}`).catch(() => []);
      setRows(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [user]);
  useEffect(() => {
    run('all', '');
  }, [run]);
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(sport, q);
        }}
        className="card !p-3 mb-4 flex flex-col gap-2"
        role="search"
      >
        <div className="flex gap-2">
          <input className="input flex-1 min-w-0" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cfind.qPh')} aria-label={t('cfind.qPh')} />
          <button className="btn-primary shrink-0 gap-1.5" disabled={busy}><UiIcon name="search" className="w-4 h-4" />{t('disc.search')}</button>
        </div>
        <Segmented items={['all', 'pickleball', 'badminton']} value={sport} onChange={(v) => { setSport(v); run(v, q); }} label={(k) => (k === 'all' ? t('cfind.allSports') : t(`clubs.sport_${k}`))} />
      </form>
      {error && <p className="card text-red-300 text-sm mb-3">{error}</p>}
      {!rows && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {rows && rows.length === 0 && (
        <div className="card text-center py-8">
          <div className="mb-2 flex justify-center text-gray-500"><UiIcon name="search" className="w-8 h-8" /></div>
          <p className="text-gray-300 text-sm">{t('cfind.none')}</p>
          <p className="text-gray-500 text-xs mt-1">{t('cfind.noneHint')}</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(rows || []).map((c) => (
          <Link key={c.id} href={`/coach/${c.slug}`} className="card !p-4 hover:border-lime-400/40 flex flex-col gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar uid={c.avatar_uid} v={c.avatar_v} name={c.display_name} size={44} />
              <div className="min-w-0">
                <p className="text-white font-semibold break-words">{c.display_name}</p>
                <p className="text-gray-400 text-xs">{t(`clubs.sport_${c.sport}`)}{c.area ? ` · ${c.area}` : ''}</p>
              </div>
            </div>
            {c.bio && <p className="text-gray-300 text-sm line-clamp-2">{c.bio}</p>}
            <div className="flex flex-wrap items-center gap-2 text-xs mt-auto">
              <span className={`tabular-nums ${c.rating != null ? 'text-amber-200' : 'text-gray-500'}`}>{c.rating != null ? `★ ${c.rating} (${c.reviews})` : t('cfind.noRating')}</span>
              {c.open_classes > 0 && <span className="rounded-full bg-lime-400/15 text-lime-300 px-2 py-0.5">{t('cfind.classes', { n: c.open_classes })}</span>}
              {c.one_on_one && <span className="rounded-full bg-sky-400/15 text-sky-200 px-2 py-0.5">{t('cfind.oneOnOne')}</span>}
              {c.price_note && <span className="text-gray-400">{c.price_note}</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
