'use client';
import { useState } from 'react';
import PaymentCard from '@/components/PaymentCard';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { localDate } from '@/lib/dates';

// How one bar reads: the value now and the bar it must reach.
function valueText(c, t) {
  if (c.key === 'members') return `${c.value}/${c.target}`;
  if (c.key === 'plan') return `${String(c.value || 'free').toUpperCase()} / ${String(c.target).toUpperCase()}`;
  if (c.key === 'sessions') return `${c.value} / ${c.target}`;
  return t('top10.pctOf', { n: c.count, pct: c.value, target: c.target });
}

// Top 10 cộng đồng uy tín: each condition with its progress, ✓ when it is reached.
export function Top10Checks({ reputation, compact = false }) {
  const { t } = useI18n();
  if (!reputation) return null;
  return (
    <ul className={`grid gap-2 ${compact ? '' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
      {reputation.checks.map((c) => (
        <li key={c.key} className={`rounded-xl border px-3 py-2.5 ${c.ok ? 'border-lime-400/50 bg-lime-400/5' : 'border-navy-600 bg-navy-900/40'}`}>
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm text-gray-200 font-medium leading-tight">{t(`top10.c_${c.key}`)}</span>
            {c.ok ? (
              <span className="shrink-0 rounded-full bg-lime-400/15 px-2 py-0.5 text-[11px] font-semibold text-lime-300">✓ {t('top10.ok')}</span>
            ) : (
              <span className="shrink-0 text-[11px] text-gray-400 tabular-nums">{Math.round(c.progress)}%</span>
            )}
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className={`text-lg font-bold tabular-nums ${c.ok ? 'text-lime-300' : 'text-white'}`}>{valueText(c, t)}</span>
            <span className="text-[11px] text-gray-500">{t(`top10.need_${c.key}`, { n: c.target })}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-navy-700 overflow-hidden" role="progressbar" aria-valuenow={Math.round(c.progress)} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full ${c.ok ? 'bg-lime-400' : 'bg-sky-400'}`} style={{ width: `${Math.max(2, c.progress)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// The overall line: "Đủ điều kiện đăng ký" or what is still missing.
export function Top10Verdict({ reputation, children = null }) {
  const { t } = useI18n();
  if (!reputation) return null;
  return reputation.eligible ? (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lime-400/50 bg-lime-400/10 px-3 py-2">
      <span className="text-sm font-semibold text-lime-200">✓ {t('top10.eligible')}</span>
      {children}
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2">
      <span className="text-sm text-amber-100">{t('top10.notYet', { n: reputation.failing.length })}</span>
      {children}
    </div>
  );
}

const EMPTY = { name: '', members: '', sessions_held: '', active_pct: '', new_month_avg: '' };

// The registration form (in a pop-up on Báo lỗi / Liên hệ nhà phát triển): the community's
// numbers (filled in by the button), a note, the conditions, months and the payment.
export function Top10Register({ club, data, reload }) {
  const { t } = useI18n();
  const [f, setF] = useState(EMPTY);
  const [note, setNote] = useState('');
  const [months, setMonths] = useState(3);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [missing, setMissing] = useState(null);
  const owner = club && club.role !== 'co_admin';
  const rep = data?.reputation;
  const cur = data?.current;
  const day = (v) => (v ? localDate(`${v}T00:00:00`, 'vi-VN') : '—');

  function autofill() {
    if (!rep) return;
    setF({ name: rep.info.name || club?.name || '', members: rep.info.members, sessions_held: rep.info.sessions_held, active_pct: rep.info.active_pct, new_month_avg: rep.info.new_month_avg });
  }

  async function run(fn) {
    setBusy(true);
    setErr('');
    try {
      await fn();
      await reload();
    } catch (e) {
      if (e.payload?.code === 'not_eligible') setMissing(e.payload.failing || []);
      else setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function register() {
    setMissing(null);
    // Not every condition reached: say which ones, nothing is sent.
    if (!rep?.eligible) return setMissing(rep?.failing || []);
    run(() => api.post(`/api/clubs/${club.id}/featured`, { months, note, info: f }));
  }

  if (data && !data.ready) return <p className="text-amber-200 text-sm">{t('featured.migration')}</p>;
  if (!data) return <p className="text-gray-400 text-sm">{t('common.loading')}</p>;

  if (cur) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-lg font-bold text-white">{t(`featured.st_${cur.status}`)}</p>
        {cur.status === 'awaiting_payment' && (
          <>
            <p className="text-gray-300 text-sm">{t('featured.payHint', { n: cur.months })}</p>
            <PaymentCard payment={cur.payment} hint={t('top10.payHint')} />
            {owner && (
              <div className="flex justify-end">
                <button type="button" className="text-red-300 text-sm" disabled={busy} onClick={() => window.confirm(t('featured.cancelAsk')) && run(() => api.del(`/api/clubs/${club.id}/featured`))}>{t('featured.cancel')}</button>
              </div>
            )}
          </>
        )}
        {cur.status === 'in_review' && <p className="text-gray-300 text-sm">{t('featured.reviewHint')}</p>}
        {cur.status === 'active' && (
          <p className="text-gray-200">
            {t('featured.activeLine', { pos: cur.position, from: day(cur.starts_on), to: day(cur.ends_on) })}
            {cur.trust_score != null && <span className="block text-sm text-lime-300 mt-1">⭐ {t('featured.trust', { n: cur.trust_score })}</span>}
          </p>
        )}
        {err && <p className="text-red-400 text-sm">{err}</p>}
      </div>
    );
  }

  const field = (k, type = 'number') => (
    <div className={k === 'name' ? 'col-span-2' : ''}>
      <label className="text-xs text-gray-400" htmlFor={`top10-${k}`}>{t(`top10.f_${k}`)}</label>
      <input id={`top10-${k}`} className="input" type={type} inputMode={type === 'number' ? 'decimal' : undefined} min="0" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {data.dropped_not_eligible && <p className="rounded-lg border border-amber-300/50 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">⚠️ {t('top10.dropped')}</p>}
      {/* The conditions first: a community that does not reach them cannot register. */}
      <section className={`rounded-xl border px-3 py-3 ${rep?.eligible ? 'border-lime-400/50 bg-lime-400/5' : 'border-amber-300/50 bg-amber-300/5'}`}>
        <h3 className="text-white font-semibold text-sm">📋 {t('top10.rulesTitle')}</h3>
        <ol className="list-decimal pl-5 mt-1 text-sm text-gray-200 space-y-0.5">
          {(rep?.checks || []).map((c) => (
            <li key={c.key}>
              {t(`top10.rule_${c.key}`, { n: c.target })}{' '}
              <span className={c.ok ? 'text-lime-300' : 'text-amber-200'}>{c.ok ? `✓ ${t('top10.ok')}` : `· ${t('top10.now', { v: valueText(c, t) })}`}</span>
            </li>
          ))}
        </ol>
        <div className="mt-2"><Top10Verdict reputation={rep} /></div>
      </section>
      {data.last?.status === 'rejected' && <p className="rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">✕ {t('featured.rejected')}{data.last.owner_note ? `: ${data.last.owner_note}` : ''}</p>}
      <p className="text-gray-300 text-sm">{t('featured.what')}</p>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-white font-semibold text-sm">{t('top10.infoTitle')}</h3>
          <button type="button" className="btn-secondary text-sm !py-1.5" onClick={autofill}>⚡ {t('top10.autofill')}</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {field('name', 'text')}
          {field('members')}
          {field('sessions_held')}
          {field('active_pct')}
          {field('new_month_avg')}
        </div>
        <p className="text-[11px] text-gray-500 mt-1">{t('top10.autofillHint')}</p>
        <label className="text-xs text-gray-400 mt-3 block" htmlFor="top10-note">{t('top10.note')}</label>
        <textarea id="top10-note" className="input" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </section>

      <section>
        <h3 className="text-white font-semibold text-sm mb-2">{t('top10.conditions')}</h3>
        <Top10Checks reputation={rep} compact />
      </section>

      <section>
        <h3 className="text-white font-semibold text-sm mb-2">{t('featured.choose')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup">
          {data.months.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={months === m} onClick={() => setMonths(m)} className={`rounded-xl border p-2.5 text-center ${months === m ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300'}`}>
              <span className="block font-bold">{t('plan.nMonths', { n: m })}</span>
              <span className="block text-xs text-gray-400">{formatVnd(data.price_month * m)}</span>
            </button>
          ))}
        </div>
        <p className="text-gray-400 text-xs mt-2">{t('featured.slotsLeft', { n: data.slots_left })}</p>
      </section>

      {missing && (
        <div className="rounded-xl border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm text-red-100" role="alert">
          <p className="font-semibold">✕ {t('top10.notEligible')}</p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            {missing.map((k) => {
              const c = rep?.checks.find((x) => x.key === k);
              return <li key={k}>{t(`top10.c_${k}`)}: {c ? valueText(c, t) : ''} · {t(`top10.need_${k}`, { n: c?.target })}</li>;
            })}
          </ul>
        </div>
      )}
      {err && <p className="text-red-400 text-sm">{err}</p>}
      {owner ? (
        <div className="flex justify-end">
          <button type="button" className={`${rep?.eligible ? 'btn-primary' : 'btn-secondary opacity-80'} max-sm:w-full sm:px-8`} disabled={busy} onClick={register}>
            {t('featured.ask', { amount: formatVnd(data.price_month * months) })}
          </button>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">{t('featured.ownerOnly')}</p>
      )}
    </div>
  );
}
