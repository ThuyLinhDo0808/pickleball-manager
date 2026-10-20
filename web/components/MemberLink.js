'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { localDate } from '@/lib/dates';

const day = (iso) => localDate(new Date(iso), 'vi-VN');

// In a member's details, when no account is linked yet (the phone did not match):
// a personal link to send them, or the account they already have (they confirm it).
// Hidden for staff who can't do this and before the migration is run.
export default function MemberLink({ club, member, onChanged }) {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get(`/api/clubs/${club.id}/members/${member.id}/link`), [club.id, member.id]);
  const [made, setMade] = useState(null); // { url, expires_at } — shown once
  const [login, setLogin] = useState('');
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  if (error || !data || data.linked) return null;

  const run = async (fn) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      await reload();
      onChanged?.();
    } catch (e) {
      const code = e.payload?.code;
      setErr(t(`mlink.err_${code}`) === `mlink.err_${code}` ? e.message : t(`mlink.err_${code}`));
    } finally {
      setBusy(false);
    }
  };
  const makeLink = () =>
    run(async () => {
      const r = await api.post(`/api/clubs/${club.id}/members/${member.id}/link`);
      setMade({ url: `${window.location.origin}${r.path}`, expires_at: r.expires_at });
      setCopied(false);
    });
  const ask = (e) => {
    e.preventDefault();
    run(async () => {
      setSent(await api.post(`/api/clubs/${club.id}/members/${member.id}/link-request`, { login }));
      setLogin('');
    });
  };
  const cancel = () => window.confirm(t('mlink.cancelAsk')) && run(async () => {
    await api.del(`/api/clubs/${club.id}/members/${member.id}/link`);
    setMade(null);
    setSent(null);
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(made.url);
      setCopied(true);
    } catch {
      window.prompt(t('mlink.copyManual'), made.url);
    }
  };
  const req = data.request;
  const open = !!data.link || req?.state === 'pending';

  return (
    <section className="rounded-xl border border-lime-400/25 bg-lime-400/5 p-3 text-sm" aria-labelledby="mlink-title">
      <h3 id="mlink-title" className="font-semibold text-white">🔗 {t('mlink.title')}</h3>
      <p className="mt-0.5 text-xs text-gray-400">{t(member.phone ? 'mlink.hintPhone' : 'mlink.hintNoPhone')}</p>

      <div className="mt-3">
        <p className="text-xs font-semibold text-gray-300">1. {t('mlink.linkTitle')}</p>
        {made ? (
          <div className="mt-1.5">
            <div className="flex gap-2">
              <input className="input !py-1.5 text-xs" readOnly value={made.url} onFocus={(e) => e.target.select()} aria-label={t('mlink.linkTitle')} />
              <button type="button" className="btn-primary !py-1.5 text-xs shrink-0" onClick={copy}>{copied ? `✓ ${t('mlink.copied')}` : t('mlink.copy')}</button>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">{t('mlink.madeHint', { date: day(made.expires_at) })}</p>
          </div>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary !py-1.5 text-xs" disabled={busy} onClick={makeLink}>{data.link ? t('mlink.newLink') : t('mlink.makeLink')}</button>
            {data.link && <span className="text-[11px] text-gray-400">{t('mlink.linkOpen', { date: day(data.link.expires_at) })}</span>}
          </div>
        )}
      </div>

      <form className="mt-3" onSubmit={ask}>
        <label htmlFor={`mlink-login-${member.id}`} className="text-xs font-semibold text-gray-300">2. {t('mlink.askTitle')}</label>
        <div className="mt-1.5 flex gap-2">
          <input id={`mlink-login-${member.id}`} className="input !py-1.5 text-sm" autoCapitalize="none" placeholder={t('mlink.loginPh')} value={login} onChange={(e) => setLogin(e.target.value)} />
          <button type="submit" className="btn-secondary !py-1.5 text-xs shrink-0" disabled={busy || !login.trim()}>{t('mlink.send')}</button>
        </div>
        {sent && <p className="mt-1 text-[11px] text-lime-300">✓ {t('mlink.sent', { who: [sent.username && `@${sent.username}`, sent.name, sent.email].filter(Boolean).join(' · ') })}</p>}
        {!sent && req && (
          <p className={`mt-1 text-[11px] ${req.state === 'declined' ? 'text-amber-200' : 'text-gray-400'}`}>
            {t(`mlink.req_${req.state}`, { who: req.username ? `@${req.username}` : req.email || '', date: day(req.created_at) })}
          </p>
        )}
      </form>

      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      {open && (
        <button type="button" className="mt-2 text-[11px] text-gray-400 underline" disabled={busy} onClick={cancel}>{t('mlink.cancel')}</button>
      )}
    </section>
  );
}
