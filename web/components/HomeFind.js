'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Segmented from '@/components/ui/Segmented';
import ClubAvatar from '@/components/ClubAvatar';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { formatDay, hhmm, todayYmd } from '@/lib/dates';
import { formatVnd } from '@/lib/format';
import { PROVINCES } from '@/lib/regions';

// Home search with two tabs: "Tìm kèo" (open sessions of the next 3 days, by place) and
// "Tìm CLB / cộng đồng" (the club search, /discover).
const FIRST = 5;

// eventsOnly: just the "Tìm kèo" part (the /discover page has its own tabs).
export default function HomeFind({ eventsOnly = false }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState('events');
  const [query, setQuery] = useState('');
  const [province, setProvince] = useState('');
  const [place, setPlace] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [all, setAll] = useState(false); // first FIRST games, then "Xem thêm"

  const run = useCallback(async (prov, q) => {
    setBusy(true);
    setError('');
    try {
      const qs = new URLSearchParams(Object.entries({ province: prov, q }).filter(([, v]) => v));
      setAll(false);
      setRes(await api.publicGet(`/api/public/discover/events${qs.toString() ? `?${qs}` : ''}`));
    } catch (e) {
      setError(e.message || t('public.loadError'));
    } finally {
      setBusy(false);
    }
  }, [t]);
  useEffect(() => {
    if (tab === 'events' && !res) run('', '');
  }, [tab, res, run]);

  const today = todayYmd();
  const days = [];
  const items = res?.items || [];
  for (const e of all || eventsOnly ? items : items.slice(0, FIRST)) {
    const last = days[days.length - 1];
    if (last && last.date === e.event_date) last.items.push(e);
    else days.push({ date: e.event_date, items: [e] });
  }

  return (
    <section className="card !p-3 mb-4">
      {!eventsOnly && <Segmented full items={['events', 'clubs']} value={tab} onChange={setTab} label={(k) => (k === 'events' ? `🎟 ${t('findx.tabEvents')}` : `🏟 ${t('findx.tabClubs')}`)} className="mb-3 w-full" />}
      {tab === 'clubs' && !eventsOnly ? (
        <form
          onSubmit={(e) => { e.preventDefault(); router.push(`/discover${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`); }}
          className="flex items-center gap-2"
          role="search"
        >
          <input className="input !py-2 flex-1 min-w-0" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('disc.homePh')} aria-label={t('disc.homeTitle')} />
          <button className="btn-primary !py-2 shrink-0">🔍 {t('disc.search')}</button>
        </form>
      ) : (
        <>
          <form onSubmit={(e) => { e.preventDefault(); run(province, place.trim()); }} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2" role="search">
            <select className="input !py-2 text-sm" value={province} onChange={(e) => setProvince(e.target.value)} aria-label={t('creq.province')}>
              <option value="">{t('disc.anyProvince')}</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input className="input !py-2 text-sm min-w-0" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t('findx.placePh')} aria-label={t('findx.placePh')} />
            <button className="btn-primary !py-2 justify-self-end" disabled={busy}>🔍 {t('disc.search')}</button>
          </form>
          <p className="text-gray-500 text-xs mt-2">{t('findx.hint')}</p>
          {error && <p className="text-red-300 text-sm mt-2">{error}</p>}
          {busy && !res && <p className="text-gray-400 text-sm mt-2">{t('common.loading')}</p>}
          {res && !days.length && !busy && <p className="text-gray-300 text-sm mt-3 text-center py-3">{t('findx.none')}</p>}
          <div className="flex flex-col gap-3 mt-3">
            {days.map((d) => (
              <div key={d.date} className="rounded-xl border border-navy-700 overflow-hidden">
                <div className="px-3 py-2 border-b border-dashed border-navy-600 text-white text-sm font-semibold capitalize">
                  {d.date === today ? t('hub.today') : formatDay(d.date, lang, { weekday: 'long', day: 'numeric', month: 'numeric' })}
                </div>
                <ul className="divide-y divide-navy-700">
                  {d.items.map((e) => {
                    const full = e.slots && e.main_count >= e.slots;
                    return (
                      <li key={e.id}>
                        <Link href={`/e/${e.link}`} className="flex items-start gap-3 px-3 py-2.5 hover:bg-navy-800/60">
                          <span className="w-12 shrink-0 text-gray-300 font-bold tabular-nums">{e.start_time ? hhmm(e.start_time) : '—'}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-white text-sm font-semibold leading-snug break-words">{e.title}</span>
                            <span className="block text-gray-400 text-xs break-words">{[e.club?.name, e.location || [e.club?.district, e.club?.province].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</span>
                            <span className="block text-xs mt-0.5">
                              <span className="text-lime-300">{Number(e.fee_amount) > 0 ? formatVnd(e.fee_amount) : t('public.free')}</span>
                              {e.slots ? <span className={full ? 'text-amber-300' : 'text-gray-300'}> · {full ? t('findx.fullWait') : t('findx.left', { n: e.slots - e.main_count, total: e.slots })}</span> : null}
                            </span>
                          </span>
                          <span className="shrink-0 flex flex-col items-end gap-1">
                            <ClubAvatar id={e.club?.id} name={e.club?.name} size={30} />
                            <span className="text-lime-400 text-xs">{t('findx.signUp')} →</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {!eventsOnly && items.length > FIRST && (
            <div className="mt-2 text-right">
              <button type="button" className="text-lime-300 text-sm underline" onClick={() => setAll(!all)}>
                {all ? t('findx.less') : t('findx.more', { n: items.length - FIRST })}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
