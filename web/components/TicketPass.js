'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { resizeImage } from '@/lib/image';

// Player: pass my ticket to someone on the waitlist — through the Host (services/ticketPass.js).
export function PassMyTicket({ reg, waitlistCount, onChanged }) {
  const { t } = useI18n();
  const [pass, setPass] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [agree, setAgree] = useState(false);
  const file = useRef(null);
  const load = useCallback(() => api.get(`/api/player/participations/${reg.id}/pass`).then((r) => setPass(r.pass)).catch(() => setPass(null)), [reg.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (pass === undefined || reg.status !== 'registered') return null;

  if (!pass) {
    if (!waitlistCount) return null;
    return (
      <div className="w-full rounded-xl border border-navy-600 px-3 py-3 text-left">
        <p className="text-white text-sm font-semibold">🎟 {t('pass.cantGo')}</p>
        <p className="text-gray-400 text-xs mt-0.5 mb-2">{t('pass.howTo')}</p>
        <button type="button" className="btn-secondary w-full" disabled={busy} onClick={() => window.confirm(t('pass.askConfirm')) && run(() => api.post(`/api/player/participations/${reg.id}/pass`, {}))}>
          {t('pass.ask')}
        </button>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-sky-400/50 bg-sky-400/5 px-3 py-3 text-left">
      <p className="text-sky-100 font-semibold">🎟 {t(`pass.st_${pass.status}`)}</p>
      {pass.status === 'open' && <p className="text-gray-300 text-sm mt-1">{t('pass.openHint')}</p>}
      {['matched', 'proof_submitted'].includes(pass.status) && (
        <p className="text-gray-200 text-sm mt-1">{t('pass.matchedHint', { name: pass.to_name || '—', amount: formatVnd(pass.amount) })}</p>
      )}
      {pass.host_note && <p className="text-red-200 text-sm mt-1">⚠️ {pass.host_note}</p>}
      {pass.status === 'matched' && (
        <div className="flex flex-col gap-2 mt-3">
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) setPreview(await resizeImage(f).catch(() => ''));
          }} />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="max-h-60 w-auto self-center rounded-lg border border-navy-600" />
          ) : null}
          <button type="button" className="btn-secondary" onClick={() => file.current?.click()}>📎 {preview ? t('signup.otherImage') : t('pass.uploadProof')}</button>
          <label className="flex items-start gap-2 text-sm text-gray-200">
            <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>{t('pass.terms', { amount: formatVnd(pass.amount) })}</span>
          </label>
          <button type="button" className="btn-primary py-3" disabled={busy || !preview || !agree} onClick={() => run(() => api.post(`/api/player/participations/${reg.id}/pass/proof`, { image: preview, accept_terms: true }))}>
            {t('pass.sendProof')}
          </button>
        </div>
      )}
      {pass.status === 'proof_submitted' && <p className="text-gray-300 text-sm mt-1">{t('pass.waitHost')}</p>}
      {['open', 'matched'].includes(pass.status) && (
        <button type="button" className="text-red-300 text-sm mt-3" disabled={busy} onClick={() => window.confirm(t('pass.cancelAsk')) && run(() => api.post(`/api/player/participations/${reg.id}/pass/cancel`, {}))}>
          {t('pass.cancel')}
        </button>
      )}
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}

// Host: tickets players want to pass — pick who on the waitlist takes it, check the money, move it.
export function HostTicketPasses({ event, onChanged }) {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [pick, setPick] = useState({});
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const load = useCallback(() => api.get(`/api/events/${event.id}/passes`).then(setData).catch(() => setData(null)), [event.id]);
  useEffect(() => {
    load();
  }, [load]);
  const live = (data?.passes || []).filter((x) => x.status !== 'done');
  if (!live.length) return null;

  async function act(pass, action, body = {}) {
    setBusy(true);
    try {
      await api.post(`/api/events/${event.id}/passes/${pass.id}/${action}`, body);
      setViewing(null);
      await load();
      onChanged?.();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function open(pass) {
    try {
      const r = await api.get(`/api/events/${event.id}/passes/${pass.id}/proof`);
      setViewing({ pass, image: r.image });
    } catch (err) {
      window.alert(err.message);
    }
  }

  return (
    <div className="card mb-4 border-sky-400/40">
      <h3 className="text-sky-200 font-semibold mb-1">🎟 {t('pass.hostTitle')} ({live.length})</h3>
      <p className="text-gray-500 text-xs mb-2">{t('pass.hostHint')}</p>
      <ul className="divide-y divide-navy-700">
        {live.map((x) => (
          <li key={x.id} className="py-3 flex flex-col gap-2 text-sm">
            <div className="text-white">
              <b>{x.from?.full_name}</b> · {formatVnd(x.amount)} <span className="ml-1 text-[11px] rounded border border-sky-400/50 text-sky-200 px-1">{t(`pass.hst_${x.status}`)}</span>
              {x.to && <span className="block text-gray-300 text-xs">→ {x.to.full_name}{x.to.phone ? <> · <a href={`tel:${x.to.phone}`} className="text-sky-300">{x.to.phone}</a></> : null}</span>}
            </div>
            {['open', 'matched'].includes(x.status) && (
              <div className="flex flex-wrap items-center gap-2">
                <select className="input !w-auto !py-1.5 text-sm flex-1 min-w-[12rem]" value={pick[x.id] || x.to_participant_id || ''} onChange={(e) => setPick({ ...pick, [x.id]: e.target.value })} aria-label={t('pass.pickTaker')}>
                  <option value="">{t('pass.pickTaker')}</option>
                  {(data.waitlist || []).map((w, i) => <option key={w.id} value={w.id}>{`${i + 1}. ${w.full_name}${w.phone ? ` · ${w.phone}` : ''}`}</option>)}
                </select>
                <button type="button" className="btn-primary !py-1.5 text-sm" disabled={busy || !(pick[x.id] || x.to_participant_id)} onClick={() => act(x, 'match', { to_participant_id: pick[x.id] || x.to_participant_id })}>
                  {x.status === 'matched' ? t('pass.changeTaker') : t('pass.setTaker')}
                </button>
              </div>
            )}
            {x.status === 'matched' && <p className="text-gray-400 text-xs">{t('pass.waitingProof')}</p>}
            <div className="flex flex-wrap gap-3">
              {x.status === 'proof_submitted' && (
                <>
                  <button type="button" className="text-sky-300 text-xs font-semibold" onClick={() => open(x)}>{t('review.view')}</button>
                  <button type="button" className="text-lime-400 text-xs font-semibold" disabled={busy} onClick={() => window.confirm(t('pass.confirmAsk', { from: x.from?.full_name, to: x.to?.full_name })) && act(x, 'confirm')}>✓ {t('pass.confirm')}</button>
                  <button type="button" className="text-amber-300 text-xs" disabled={busy} onClick={() => { const note = window.prompt(t('pass.rejectAsk')); if (note !== null) act(x, 'reject', { note }); }}>{t('pass.reject')}</button>
                </>
              )}
              <button type="button" className="text-red-400 text-xs" disabled={busy} onClick={() => window.confirm(t('pass.hostCancelAsk')) && act(x, 'cancel')}>{t('pass.hostCancel')}</button>
            </div>
          </li>
        ))}
      </ul>
      <Modal open={!!viewing} title={t('pass.proofTitle', { name: viewing?.pass.from?.full_name || '' })} onClose={() => setViewing(null)}>
        {viewing && (
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {viewing.image ? <img src={viewing.image} alt="" className="w-full h-auto rounded-lg border border-navy-600" /> : <p className="text-gray-400">—</p>}
            <p className="text-xs text-gray-400">✓ {t('pass.termsAccepted')}</p>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => act(viewing.pass, 'confirm')}>✓ {t('pass.confirm')}</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
