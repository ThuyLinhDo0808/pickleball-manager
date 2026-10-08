'use client';
import { useState } from 'react';
import Link from 'next/link';
import OwnerShell, { fmtDate, fmtTime } from '@/components/OwnerShell';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

const PAID_TIERS = ['basic', 'standard', 'advanced', 'pro'];
const STATE_BADGE = { live: 'bg-lime-400/20 text-lime-200', expired: 'bg-navy-700 text-gray-400', used_up: 'bg-amber-300/20 text-amber-200', off: 'bg-navy-700 text-gray-400' };

function NewCode({ onDone, onCancel }) {
  const { t } = useI18n();
  const [f, setF] = useState({ code: '', kind: 'percent', percent: 20, applies_to: 'any', first_order_only: false, trial_tier: 'pro', trial_days: 14, expires_on: '', max_uses: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.post('/api/owner/promos', {
        ...f,
        percent: Number(f.percent),
        trial_days: Number(f.trial_days),
        expires_on: f.expires_on || null,
        max_uses: f.max_uses === '' ? null : Number(f.max_uses),
      });
      onDone();
    } catch (x) {
      setErr(x.payload?.code === 'code_taken' ? t('owner.promoTaken') : x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="card !p-4 flex flex-col gap-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm text-gray-300">
          {t('owner.promoCode')}
          <input className="input mt-1 uppercase font-mono" required maxLength={32} pattern="[A-Za-z0-9_\-]{3,32}" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="SALE20" />
        </label>
        <div className="text-sm text-gray-300">
          {t('owner.promoKind')}
          <div className="flex gap-1.5 mt-1">
            {['percent', 'trial'].map((k) => (
              <button key={k} type="button" onClick={() => setF({ ...f, kind: k })} className={`rounded-lg px-3 py-2 text-sm border flex-1 ${f.kind === k ? 'border-amber-300 bg-amber-300 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}>
                {t(`owner.promo_${k}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
      {f.kind === 'percent' ? (
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <label className="text-sm text-gray-300">
            {t('owner.promoPercent')}
            <input type="number" min={1} max={100} className="input mt-1" required value={f.percent} onChange={set('percent')} />
          </label>
          <label className="text-sm text-gray-300">
            {t('owner.promoAppliesTo')}
            <select className="input mt-1" value={f.applies_to} onChange={set('applies_to')}>
              {['any', 'tier', 'social_manager'].map((k) => <option key={k} value={k}>{t(`owner.applies_${k}`)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300 pb-2">
            <input type="checkbox" checked={f.first_order_only} onChange={set('first_order_only')} />
            {t('owner.promoFirstOnly')}
          </label>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm text-gray-300">
            {t('owner.promoTrialTier')}
            <select className="input mt-1" value={f.trial_tier} onChange={set('trial_tier')}>
              {PAID_TIERS.map((k) => <option key={k} value={k}>{k.toUpperCase()}</option>)}
            </select>
          </label>
          <label className="text-sm text-gray-300">
            {t('owner.promoTrialDays')}
            <input type="number" min={1} max={365} className="input mt-1" required value={f.trial_days} onChange={set('trial_days')} />
          </label>
        </div>
      )}
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-sm text-gray-300">
          {t('owner.promoExpires')}
          <input type="date" className="input mt-1" value={f.expires_on} onChange={set('expires_on')} />
        </label>
        <label className="text-sm text-gray-300">
          {t('owner.promoMaxUses')}
          <input type="number" min={1} className="input mt-1" value={f.max_uses} onChange={set('max_uses')} placeholder="∞" />
        </label>
        <label className="text-sm text-gray-300">
          {t('owner.promoNote')}
          <input className="input mt-1" maxLength={300} value={f.note} onChange={set('note')} />
        </label>
      </div>
      <p className="text-gray-500 text-xs">{t('owner.promoRules')}</p>
      {err && <p className="text-red-300 text-sm">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn-secondary text-sm" onClick={onCancel}>{t('common.cancel')}</button>
        <button type="submit" className="btn-primary text-sm" disabled={busy}>{t('owner.promoCreate')}</button>
      </div>
    </form>
  );
}

function Uses({ id }) {
  const { t } = useI18n();
  const { data } = useLoad(() => api.get(`/api/owner/promos/${id}/redemptions`), [id]);
  if (!data) return <p className="text-gray-500 text-xs mt-2">{t('common.loading')}</p>;
  if (!data.length) return <p className="text-gray-500 text-xs mt-2">{t('owner.promoNoUses')}</p>;
  return (
    <ul className="mt-2 divide-y divide-navy-800 text-xs">
      {data.map((r) => (
        <li key={r.id} className="py-1.5 flex flex-wrap justify-between gap-2">
          <Link href={`/owner/hosts/${r.host_id}`} className="text-gray-200 hover:text-white">{r.email || '—'}</Link>
          <span className="text-gray-400">
            {fmtTime(r.created_at)}
            {r.order ? ` · ${r.order.ref} · −${formatVnd(r.discount_amount)} · ${t(`admin.st_${r.order.status}`)}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Promo codes: X% off a plan order, or N days of a plan switched on at once.
export default function OwnerPromosPage() {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get('/api/owner/promos'), []);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const toggle = async (c) => {
    await api.patch(`/api/owner/promos/${c.id}`, { active: !c.active }).catch(() => {});
    reload();
  };
  return (
    <OwnerShell title={t('owner.tabPromos')}>
      <p className="text-gray-400 text-sm mb-3">{t('owner.promoHint')}</p>
      {adding ? (
        <NewCode onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" className="btn-primary text-sm" onClick={() => setAdding(true)}>＋ {t('owner.promoCreate')}</button>
      )}
      {error && <p className="card text-red-300 text-sm mt-3">{error.message}</p>}
      {data && data.length === 0 && <p className="card text-gray-500 text-sm mt-3">{t('owner.promoNone')}</p>}
      {data && data.length > 0 && (
        <ul className="flex flex-col gap-2 mt-4">
          {data.map((c) => (
            <li key={c.id} className="card !p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-lime-300 font-bold">{c.code}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_BADGE[c.state]}`}>{t(`owner.promoSt_${c.state}`)}</span>
                </div>
                <span className="text-white text-sm font-semibold">
                  {c.kind === 'percent' ? t('owner.promoPctLine', { p: c.percent, what: t(`owner.applies_${c.applies_to}`) }) : t('owner.promoTrialLine', { tier: String(c.trial_tier).toUpperCase(), n: c.trial_days })}
                </span>
              </div>
              <div className="text-gray-400 text-xs mt-1 flex flex-wrap gap-x-3">
                <span>{t('owner.promoUsed', { n: c.uses, max: c.max_uses ?? '∞' })}</span>
                {c.kind === 'percent' && <span>{t('owner.promoPaid', { n: c.paid_uses, v: formatVnd(c.discount_given) })}</span>}
                <span>{c.expires_on ? t('owner.promoUntil', { d: fmtDate(c.expires_on) }) : t('owner.promoNoExpiry')}</span>
                {c.first_order_only && <span>{t('owner.promoFirstOnlyShort')}</span>}
                {c.note && <span className="text-gray-500">📝 {c.note}</span>}
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? '▲' : '▼'} {t('owner.promoWho')}</button>
                <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => toggle(c)}>{c.active ? `⏸ ${t('owner.annTurnOff')}` : `▶ ${t('owner.annTurnOn')}`}</button>
              </div>
              {open === c.id && <Uses id={c.id} />}
            </li>
          ))}
        </ul>
      )}
    </OwnerShell>
  );
}
