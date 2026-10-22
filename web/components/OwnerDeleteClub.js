'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

// Owner only: delete a club / community for good. Shows what goes with it, then asks for
// the exact name and a reason (kept in the audit log).
export default function DeleteClub({ club, onDone }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState(null);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api.get(`/api/owner/clubs/${club.id}/delete-preview`).then(setPreview).catch((err) => setMsg(err.message));
  }, [club.id]);
  const ok = typed.trim() === club.name.trim() && reason.trim();
  async function run(e) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setMsg('');
    try {
      await api.post(`/api/owner/clubs/${club.id}/delete`, { confirm: typed.trim(), reason: reason.trim() });
      onDone();
    } catch (err) {
      setMsg(err.message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={run} className="mt-2 rounded-lg border border-red-500/50 bg-red-500/5 p-3 flex flex-col gap-2 text-xs">
      <p className="text-red-200 font-semibold">{t('owner.delClubTitle', { name: club.name })}</p>
      {preview ? (
        <ul className="list-disc pl-5 text-gray-300">
          <li>{t('clubs.delMembers', { n: preview.members })}</li>
          <li>{t('clubs.delEvents', { n: preview.events })}</li>
          <li>{t('clubs.delTournaments', { n: preview.tournaments })}</li>
          <li>{t('clubs.delMoney', { n: preview.transactions })}</li>
        </ul>
      ) : !msg && <p className="text-gray-400">{t('common.loading')}</p>}
      <p className="text-gray-400">{t('owner.delClubHint')}</p>
      <label className="text-gray-400">{t('clubs.deleteType', { name: club.name })}
        <input className="input text-sm mt-0.5" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </label>
      <label className="text-gray-400">{t('owner.delClubReason')}
        <textarea className="input text-sm mt-0.5" rows={2} maxLength={1000} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('owner.delClubReasonPh')} />
      </label>
      <div className="flex items-center justify-between gap-2">
        <span className="text-red-300">{msg}</span>
        <button className="rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold px-3 py-1.5" disabled={busy || !ok}>{t('clubs.deleteForever')}</button>
      </div>
    </form>
  );
}
