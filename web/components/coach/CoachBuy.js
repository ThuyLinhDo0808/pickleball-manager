'use client';
import { useRef, useState } from 'react';
import PaymentCard from '@/components/PaymentCard';
import { useI18n } from '@/context/I18nContext';
import { formatVnd } from '@/lib/format';
import { resizeImage } from '@/lib/image';
import { dmy } from '@/lib/coach';

const STATUS_TONE = {
  pending: 'bg-amber-300/15 text-amber-200',
  active: 'bg-lime-400/15 text-lime-300',
  refunded: 'bg-navy-700 text-gray-300',
  expired: 'bg-navy-700 text-gray-300',
};

// The student's packages with one coach: what they bought (a waiting order shows the
// transfer + screenshot upload; a refused one says why) and what the coach sells.
// `buy(packageId)` / `proof(purchaseId, image)` come from the page (signed in or by link).
export default function CoachBuy({ title, forSale = [], mine = [], buy, proof }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const file = useRef(null);
  const [target, setTarget] = useState(null);
  const openFor = new Set(mine.filter((p) => p.status === 'pending').map((p) => p.package_id));
  async function run(fn) {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function picked(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !target) return;
    let img;
    try {
      img = await resizeImage(f);
    } catch {
      setMsg(t('signup.badImage'));
      return;
    }
    run(() => proof(target, img));
  }
  if (!forSale.length && !mine.length) return null;
  return (
    <div className="grid gap-2">
      {title && <h3 className="text-gray-300 text-sm font-semibold">{title}</h3>}
      <input ref={file} type="file" accept="image/*" className="hidden" onChange={picked} />
      {mine.map((p) => {
        const left = p.sessions_total - p.sessions_used;
        return (
          <div key={p.id} className="rounded-lg border border-navy-700 px-3 py-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white font-medium break-words">{p.name}</p>
                <p className="text-gray-400 text-xs tabular-nums">
                  {formatVnd(p.price)} · {p.sessions_total} {t('coach.sessionsUnit')}
                  {p.status === 'active' && ` · ${t('coach.balLeft', { n: left })}${p.expires_on ? ` · ${t('coach.balExpires', { d: dmy(p.expires_on) })}` : ''}`}
                  {p.status === 'refunded' && p.refund_amount != null && ` · ${t('coach.refunded', { amount: formatVnd(p.refund_amount) })}`}
                </p>
              </div>
              <span className={`text-[11px] rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS_TONE[p.status] || STATUS_TONE.expired}`}>
                {p.status === 'pending' ? (p.has_proof ? t('coach.buyProofWait') : t('coach.buyPayNow')) : t(`coach.buy_${p.status}`)}
              </span>
            </div>
            {p.status === 'pending' && (
              <div className="mt-2 grid gap-2">
                {p.reject_note && <p className="text-red-300 text-sm">{t('coach.buyRejected', { note: p.reject_note })}</p>}
                {!p.has_proof && p.payment && <PaymentCard payment={p.payment} hint={t('coach.buyPayHint')} />}
                <div className="flex justify-end">
                  <button type="button" disabled={busy} className={p.has_proof ? 'btn-secondary text-sm' : 'btn-primary text-sm'} onClick={() => { setTarget(p.id); file.current?.click(); }}>
                    {p.has_proof ? t('signup.replaceProof') : t('signup.uploadProof')}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {forSale.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {forSale.map((k) => (
            <div key={k.id} className="rounded-lg border border-navy-700 px-3 py-2 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium break-words">{k.name}</p>
                <p className="text-gray-400 text-xs tabular-nums">{formatVnd(k.price)} · {t('coach.pkgLine', { n: k.sessions, m: k.valid_months })}</p>
              </div>
              {openFor.has(k.id) ? (
                <span className="text-[11px] text-amber-200 whitespace-nowrap">{t('coach.buyOpen')}</span>
              ) : (
                <button type="button" disabled={busy} className="btn-secondary text-sm whitespace-nowrap" onClick={() => window.confirm(t('coach.buyAsk', { name: k.name, price: formatVnd(k.price) })) && run(() => buy(k.id))}>
                  {t('coach.buy')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {msg && <p className="text-red-300 text-sm">{msg}</p>}
    </div>
  );
}
