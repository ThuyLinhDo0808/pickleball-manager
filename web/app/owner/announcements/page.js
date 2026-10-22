'use client';
import { useEffect, useState } from 'react';
import OwnerShell, { fmtTime, useOwnerMe } from '@/components/OwnerShell';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import Hint from '@/components/ui/Hint';

// <input type="datetime-local"> works in local time; the API stores ISO (UTC).
const toLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);
const addMinutes = (local, min) => toLocal(new Date((local ? new Date(local) : new Date()).getTime() + min * 60000).toISOString());

const stateOf = (a) => {
  const now = Date.now();
  if (!a.active) return 'off';
  if (a.ends_at && Date.parse(a.ends_at) <= now) return 'ended';
  if (Date.parse(a.starts_at) > now) return a.kind === 'maintenance' ? 'upcoming' : 'scheduled';
  return a.kind === 'maintenance' ? 'down' : 'live';
};
const STATE_BADGE = {
  live: 'bg-lime-400/20 text-lime-200',
  down: 'bg-red-500/25 text-red-200',
  upcoming: 'bg-amber-300/20 text-amber-200',
  scheduled: 'bg-sky-400/20 text-sky-200',
  ended: 'bg-navy-700 text-gray-400',
  off: 'bg-navy-700 text-gray-400',
};

// Pick one club / community (search by name or owner email).
function ClubPicker({ value, name, onPick }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { data } = useLoad(() => (open && q.trim().length >= 2 ? api.get(`/api/owner/clubs?q=${encodeURIComponent(q.trim())}`) : Promise.resolve(null)), [open, q]);
  if (value) {
    return (
      <div className="flex items-center gap-2 mt-1">
        <span className="rounded-full border border-lime-400/50 bg-lime-400/10 px-3 py-1 text-sm text-lime-100">{name || value}</span>
        <button type="button" className="text-xs text-gray-400 hover:text-white" onClick={() => onPick(null, null)}>✕ {t('ann2.anyClub')}</button>
      </div>
    );
  }
  return (
    <div className="relative mt-1">
      <input className="input" placeholder={t('ann2.clubSearch')} value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open && data?.rows?.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-navy-600 bg-navy-900 shadow-xl">
          {data.rows.slice(0, 20).map((c) => (
            <li key={c.id}>
              <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-navy-700" onClick={() => { onPick(c.id, c.name); setQ(''); setOpen(false); }}>
                {c.name} <span className="text-gray-500 text-xs">· {c.owner_email || ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Form({ initial, onDone, onCancel }) {
  const { t } = useI18n();
  const me = useOwnerMe();
  const [f, setF] = useState({
    kind: initial?.kind || 'notice',
    title: initial?.title || '',
    message: initial?.message || '',
    level: initial?.level || 'info',
    audience: initial?.audience || 'all',
    club_id: initial?.club_id || null,
    club_name: initial?.club_name || null,
    starts_at: toLocal(initial?.starts_at),
    ends_at: toLocal(initial?.ends_at),
    show_public: !!initial?.show_public,
    send_email: !!initial?.send_email,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reach, setReach] = useState(null);
  const maint = f.kind === 'maintenance';
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const emailed = !!initial?.emailed_at;

  // How many people the email would reach.
  useEffect(() => {
    if (!f.send_email || emailed) return setReach(null);
    let live = true;
    api.post('/api/owner/announcements/recipients', { kind: f.kind, audience: f.audience, club_id: f.club_id, ends_at: maint ? fromLocal(f.ends_at) || new Date(Date.now() + 3600e3).toISOString() : null })
      .then((r) => live && setReach(r))
      .catch(() => live && setReach(null));
    return () => { live = false; };
  }, [f.send_email, f.kind, f.audience, f.club_id, maint, emailed, f.ends_at]);

  const save = async (e) => {
    e.preventDefault();
    if (maint && !f.ends_at) return setErr(t('ann2.endRequired'));
    if (maint && !initial && !window.confirm(t('ann2.confirmMaint', { from: f.starts_at ? fmtTime(fromLocal(f.starts_at)) : t('ann2.now'), to: fmtTime(fromLocal(f.ends_at)) }))) return;
    if (f.send_email && !emailed && reach?.count && !window.confirm(t('ann2.confirmEmail', { n: reach.count }))) return;
    setBusy(true);
    setErr('');
    const { club_name, ...rest } = f;
    const body = { ...rest, title: f.title.trim() || null, starts_at: fromLocal(f.starts_at), ends_at: fromLocal(f.ends_at) };
    try {
      if (initial) await api.patch(`/api/owner/announcements/${initial.id}`, body);
      else await api.post('/api/owner/announcements', body);
      onDone();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  const canMaint = !!me?.owner;
  return (
    <form onSubmit={save} className="card !p-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('ann2.kind')}>
        {['notice', 'maintenance'].map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={f.kind === k}
            disabled={(k === 'maintenance' && !canMaint) || (!!initial && initial.kind !== k)}
            onClick={() => setF({ ...f, kind: k, ...(k === 'maintenance' && !f.message ? { message: t('ann2.maintTemplate') } : {}) })}
            className={`rounded-xl border px-3 py-2 text-sm text-left disabled:opacity-40 ${f.kind === k ? (k === 'maintenance' ? 'border-red-400 bg-red-500/15 text-red-100' : 'border-lime-400 bg-lime-400/10 text-lime-100') : 'border-navy-600 text-gray-300'}`}
          >
            <span className="font-semibold block">{t(`ann2.kind_${k}`)}</span>
            <span className="text-xs opacity-80">{t(`ann2.kindHint_${k}`)}</span>
          </button>
        ))}
      </div>
      {!canMaint && <p className="text-gray-500 text-xs -mt-1">{t('ann2.maintOwnerOnly')}</p>}

      <label className="text-sm text-gray-300">
        {t('ann2.title')} <span className="text-gray-500 text-xs">({t('ann2.optional')})</span>
        <input className="input mt-1" maxLength={120} value={f.title} onChange={set('title')} placeholder={maint ? t('ann2.maintTitlePh') : t('ann2.titlePh')} />
      </label>
      <label className="text-sm text-gray-300">
        {t('owner.annMessage')}
        <textarea className="input mt-1 min-h-[80px]" maxLength={500} required value={f.message} onChange={set('message')} />
        <span className="text-gray-500 text-xs">{f.message.length}/500</span>
      </label>

      {maint ? (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 flex flex-col gap-3">
          <p className="text-red-100 text-sm">{t('ann2.maintRule')}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm text-gray-300">
              {t('ann2.maintStart')}
              <input type="datetime-local" className="input mt-1" value={f.starts_at} onChange={set('starts_at')} />
              <span className="text-gray-500 text-xs">{t('ann2.maintStartHint')}</span>
            </label>
            <label className="text-sm text-gray-300">
              {t('ann2.maintEnd')} *
              <input type="datetime-local" className="input mt-1" required value={f.ends_at} onChange={set('ends_at')} />
              <span className="flex flex-wrap gap-1 mt-1">
                {[30, 60, 120, 240].map((m) => (
                  <button key={m} type="button" className="rounded-md border border-navy-600 px-2 py-0.5 text-xs text-gray-300 hover:text-white" onClick={() => setF({ ...f, ends_at: addMinutes(f.starts_at, m) })}>
                    +{m < 60 ? `${m} ${t('ann2.min')}` : `${m / 60} ${t('ann2.hour')}`}
                  </button>
                ))}
              </span>
            </label>
          </div>
          <div className="rounded-lg bg-navy-900/70 p-3 text-sm">
            <p className="text-gray-400 text-xs mb-1">{t('ann2.preview')}</p>
            <p className="text-white font-semibold">{f.title.trim() || t('maint.title')}</p>
            <p className="text-gray-200 whitespace-pre-line">{f.message}</p>
            {f.ends_at && <p className="text-amber-200 mt-1">{t('maint.backAt', { time: fmtTime(fromLocal(f.ends_at)) })}</p>}
          </div>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-sm text-gray-300">
              {t('owner.annLevel')}
              <select className="input mt-1" value={f.level} onChange={set('level')}>
                <option value="info">{t('owner.annInfo')}</option>
                <option value="warning">{t('owner.annWarning')}</option>
              </select>
            </label>
            <label className="text-sm text-gray-300">
              {t('owner.annStart')}
              <input type="datetime-local" className="input mt-1" value={f.starts_at} onChange={set('starts_at')} />
            </label>
            <label className="text-sm text-gray-300">
              {t('owner.annEnd')}
              <input type="datetime-local" className="input mt-1" value={f.ends_at} onChange={set('ends_at')} />
            </label>
          </div>
          <Hint text={t('owner.annTimeHint')} className="-mt-2" />
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm text-gray-300">
              {t('ann2.audience')}
              <select className="input mt-1" value={f.audience} onChange={set('audience')}>
                {['all', 'hosts', 'players'].map((a) => <option key={a} value={a}>{t(`ann2.aud_${a}`)}</option>)}
              </select>
            </label>
            <div className="text-sm text-gray-300">
              {t('ann2.club')} <span className="text-gray-500 text-xs">({t('ann2.optional')})</span>
              <ClubPicker value={f.club_id} name={f.club_name} onPick={(id, name) => setF({ ...f, club_id: id, club_name: name })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={f.show_public} disabled={f.audience !== 'all' || !!f.club_id} onChange={set('show_public')} />
            {t('owner.annPublic')}
          </label>
        </>
      )}

      <label className="flex items-start gap-2 text-sm text-gray-300">
        <input type="checkbox" className="mt-1" checked={f.send_email || emailed} disabled={emailed} onChange={set('send_email')} />
        <span>
          {t('ann2.sendEmail')}
          {emailed && <span className="block text-xs text-lime-300">{t('ann2.emailedN', { n: initial.emailed_count ?? 0, at: fmtTime(initial.emailed_at) })}</span>}
          {!emailed && f.send_email && reach && (reach.email_ready ? <span className="block text-xs text-gray-400">{t('ann2.reach', { n: reach.count })}</span> : <span className="block text-xs text-amber-200">{t('ann2.emailOff')}</span>)}
        </span>
      </label>

      {err && <p className="text-red-300 text-sm">{err}</p>}
      <div className="flex gap-2 justify-end">
        {onCancel && <button type="button" className="btn-secondary text-sm" onClick={onCancel}>{t('common.cancel')}</button>}
        <button type="submit" className={`${maint ? 'btn-danger' : 'btn-primary'} text-sm`} disabled={busy}>{initial ? t('common.save') : maint ? `${t('ann2.scheduleMaint')}` : t('owner.annCreate')}</button>
      </div>
    </form>
  );
}

function Board() {
  const { t } = useI18n();
  const me = useOwnerMe();
  const { data, error, reload } = useLoad(() => api.get('/api/owner/announcements'), []);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const act = async (fn) => {
    setMsg('');
    try { await fn(); } catch (x) { setMsg(x.message); }
    reload();
  };
  const toggle = (a) => act(() => api.patch(`/api/owner/announcements/${a.id}`, { active: !a.active }));
  const endNow = (a) => window.confirm(t('ann2.confirmEndNow')) && act(() => api.patch(`/api/owner/announcements/${a.id}`, { active: false }));
  const remove = (a) => window.confirm(t('ann2.confirmDelete')) && act(() => api.del(`/api/owner/announcements/${a.id}`));
  const locked = (a) => a.kind === 'maintenance' && !me?.owner;
  return (
    <>
      {adding ? (
        <Form onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" className="btn-primary text-sm mb-1" onClick={() => setAdding(true)}>＋ {t('owner.annCreate')}</button>
      )}
      {(error || msg) && <p className="card text-red-300 text-sm mt-3">{msg || error.message}</p>}
      {data && data.length === 0 && <p className="card text-gray-500 text-sm mt-3">{t('owner.noAnn')}</p>}
      {data && data.length > 0 && (
        <ul className="flex flex-col gap-2 mt-4">
          {data.map((a) => {
            const st = stateOf(a);
            if (editing === a.id) return <li key={a.id}><Form initial={a} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} /></li>;
            return (
              <li key={a.id} className={`card !p-3 ${a.kind === 'maintenance' && st === 'down' ? 'border border-red-400/60' : ''}`}>
                <div className="flex flex-wrap items-center gap-2 mb-1 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${STATE_BADGE[st]}`}>{t(`ann2.state_${st}`)}</span>
                  <span className="text-gray-300">{a.kind === 'maintenance' ? `${t('ann2.kind_maintenance')}` : t('ann2.kind_notice')}</span>
                  <span className="text-gray-400">{fmtTime(a.starts_at)} → {a.ends_at ? fmtTime(a.ends_at) : t('owner.annNoEnd')}</span>
                  {a.kind !== 'maintenance' && <span className="text-gray-300">{t(`ann2.aud_${a.audience || 'all'}`)}</span>}
                  {a.club_id && <span className="text-gray-300">{a.club_name || '—'}</span>}
                  {a.show_public && a.kind !== 'maintenance' && <span className="text-sky-200">{t('owner.annPublicShort')}</span>}
                  {a.emailed_at ? <span className="text-lime-300">{t('ann2.emailedShort', { n: a.emailed_count ?? 0 })}</span> : a.send_email ? <span className="text-amber-200">{t('ann2.emailPending')}</span> : null}
                </div>
                {a.title && <p className="text-white font-semibold text-sm">{a.title}</p>}
                <p className="text-gray-100 text-sm whitespace-pre-line break-words">{a.message}</p>
                {!locked(a) && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setEditing(a.id)}>{t('common.edit')}</button>
                    {a.kind === 'maintenance' && st === 'down' ? (
                      <button type="button" className="btn-danger !py-1 text-xs" onClick={() => endNow(a)}>✓ {t('ann2.endNow')}</button>
                    ) : (
                      <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => toggle(a)}>{a.active ? `${t('owner.annTurnOff')}` : `▶ ${t('owner.annTurnOn')}`}</button>
                    )}
                    <button type="button" className="btn-secondary !py-1 text-xs text-red-300" onClick={() => remove(a)}>{t('common.delete')}</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// Banners for everyone / an audience / one club, and maintenance (locks the app for all but the Owner).
export default function OwnerAnnouncementsPage() {
  const { t } = useI18n();
  return (
    <OwnerShell title={t('owner.tabAnnouncements')} description={t('owner.annHint')}>
      <Board />
    </OwnerShell>
  );
}
