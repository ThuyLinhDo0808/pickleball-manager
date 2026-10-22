'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// A club asked to link this account to a member it already has (the Host typed in your
// username or email): confirm it's you, or say it isn't.
export default function LinkRequests({ onChanged }) {
  const { t } = useI18n();
  const { data, reload } = useLoad(() => api.get('/api/player/link-requests').catch(() => []), []);
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState(null); // { club_id, club_name }
  const [err, setErr] = useState('');

  async function answer(r, accept) {
    if (!accept && !window.confirm(t('mlink.declineAsk', { club: r.club?.name || '' }))) return;
    setBusy(r.id);
    setErr('');
    try {
      const res = await api.post(`/api/player/link-requests/${r.id}`, { accept });
      if (accept) setDone(res);
      await reload();
      onChanged?.();
    } catch (e) {
      const code = e.payload?.code;
      setErr(t(`mlink.err_${code}`) === `mlink.err_${code}` ? e.message : t(`mlink.err_${code}`));
    } finally {
      setBusy(null);
    }
  }

  if (!done && !data?.length) return null;
  return (
    <section className="mb-4 flex flex-col gap-2" aria-label={t('mlink.reqTitle')}>
      {done && (
        <div className="rounded-xl border border-lime-400/40 bg-lime-400/10 px-4 py-3 text-sm text-lime-100" role="status">
          ✓ {t('mlink.linkedTo', { club: done.club_name })}{' '}
          <Link href={`/c/${done.club_id}`} className="font-semibold underline">{t('mlink.openClub')}</Link>
        </div>
      )}
      {(data || []).map((r) => (
        <div key={r.id} className="rounded-xl border border-sky-400/40 bg-sky-400/10 px-4 py-3 text-sm">
          <p className="text-white">{t('mlink.reqBody', { club: r.club?.name || '', name: r.member_name || '' })}</p>
          <p className="mt-0.5 text-xs text-gray-400">{t('mlink.reqHint')}</p>
          <div className="mt-2 flex justify-end flex-wrap gap-2">
            <button type="button" className="btn-secondary !py-1.5 text-sm" disabled={busy === r.id} onClick={() => answer(r, false)}>{t('mlink.notMe')}</button>
            <button type="button" className="btn-primary !py-1.5 text-sm" disabled={busy === r.id} onClick={() => answer(r, true)}>✓ {t('mlink.itsMe')}</button>
          </div>
        </div>
      ))}
      {err && (
        <p className="text-sm text-red-300">
          {err}
          {err === t('mlink.err_email_verify_required') && <> <Link href="/verify-email?next=%2Fhome" className="underline">{t('everify.barCta')}</Link></>}
        </p>
      )}
    </section>
  );
}
