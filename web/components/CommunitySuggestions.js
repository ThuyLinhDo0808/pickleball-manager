'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// Community members page: who played more than the Host's rule in the last 30 days (→ khách
// thường xuyên) and who didn't (→ khách vãng lai). Nothing moves until the Host presses.
export default function CommunitySuggestions({ club, onChanged }) {
  const { t } = useI18n();
  const { data, reload } = useLoad(() => api.get(`/api/clubs/${club.id}/community-settings/suggestions`).catch(() => null), [club.id]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!data || (!data.up?.length && !data.down?.length)) return null;

  const move = async (list, to) => {
    setBusy(true);
    setErr('');
    try {
      for (const m of list) await api.patch(`/api/clubs/${club.id}/members/${m.id}`, { member_type: to });
      await reload();
      onChanged?.();
    } catch (e) {
      setErr(e.message);
      await reload();
    } finally {
      setBusy(false);
    }
  };
  const Group = ({ list, to, title }) =>
    list.length > 0 && (
      <div className="mt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white">{title}</p>
          {list.length > 1 && <button type="button" className="btn-secondary !py-1 text-xs" disabled={busy} onClick={() => move(list, to)}>{t('suggest.moveAll', { n: list.length })}</button>}
        </div>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {list.map((m) => (
            <li key={m.id} className="flex items-center gap-1.5 rounded-full border border-navy-600 bg-navy-900 py-0.5 pl-2.5 pr-1 text-xs">
              <span className="text-gray-100">{m.full_name}</span>
              <span className="text-gray-400 tabular-nums">· {t('suggest.sessions', { n: m.sessions })}</span>
              <button type="button" className="rounded-full bg-lime-400/15 px-2 py-0.5 font-semibold text-lime-200 hover:bg-lime-400/25" disabled={busy} onClick={() => move([m], to)}>{t('suggest.move')}</button>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <section className="card !py-3 mb-3 border-amber-400/40" aria-labelledby="suggest-title">
      <h2 id="suggest-title" className="text-amber-200 font-semibold text-sm">💡 {t('suggest.title')}</h2>
      <p className="text-gray-400 text-xs mt-0.5">{t('suggest.hint', { n: data.min })}</p>
      <Group list={data.up} to="fixed" title={t('suggest.up', { n: data.min })} />
      <Group list={data.down} to="guest" title={t('suggest.down', { n: data.min })} />
      {err && <p className="text-red-300 text-xs mt-2">{err}</p>}
    </section>
  );
}
