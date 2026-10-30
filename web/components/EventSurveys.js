'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { whenText } from '@/lib/surveyTime';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// Players' answers to the after-session review: average stars, % happy with the
// organisation, % "matches were balanced", "would come back", private notes, join wishes —
// plus the session's shared survey link and QR code for the group chat.
export default function EventSurveys({ eventId }) {
  const { t, lang } = useI18n();
  const [share, setShare] = useState(false);
  const { data } = useLoad(() => api.get(`/api/events/${eventId}/surveys`).catch(() => null), [eventId]);
  if (!data) return null;
  const chip = 'text-[11px] rounded border px-1';
  return (
    <section className="card mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 className="text-white font-semibold">{t('survey.hostTitle')}</h2>
        {data.link && (
          <button type="button" className="btn-primary text-sm" onClick={() => setShare(true)}>{t('survey.shareBtn')}</button>
        )}
      </div>
      {data.count > 0 && (
        <p className="text-sm text-gray-300 flex flex-wrap gap-x-3 gap-y-1 mb-2 tabular-nums">
            <span><span className="text-amber-300 font-bold">★ {data.average}</span> · {t('survey.hostCount', { n: data.count })}</span>
            {data.org_happy_rate != null && <span>{t('survey.hostOrgHappy')} <b className="text-white">{data.org_happy_rate}%</b></span>}
            {data.balance_rate != null && <span>{t('survey.hostBalance')} <b className="text-white">{data.balance_rate}%</b></span>}
            {data.court != null && <span>{t('survey.hostCourt')} <b className="text-white">{data.court}</b></span>}
            {data.organization != null && <span>{t('survey.hostOrg')} <b className="text-white">{data.organization}</b></span>}
            {data.come_back_rate != null && <span>↩︎ {t('survey.hostComeBack')} <b className="text-white">{data.come_back_rate}%</b></span>}
        </p>
      )}
      {data.count === 0 ? (
        <p className="text-gray-500 text-sm">{t('survey.hostEmpty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-navy-700">
          {data.items.map((s, i) => (
            <li key={i} className="py-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-white">{s.full_name || '—'}</span>
                <span className="text-amber-300 tracking-wider" aria-label={`${s.rating}/5`}>{'★'.repeat(s.rating)}</span>
                {s.court_rating && <span className={`${chip} border-navy-500 text-gray-300`}>{s.court_rating}/5</span>}
                {s.organization_rating && <span className={`${chip} border-navy-500 text-gray-300`}>{s.organization_rating}/5</span>}
                {s.level_fit && <span className={`${chip} border-navy-500 text-gray-300`}>{t(`survey.level_${s.level_fit}`)}</span>}
                {s.org_satisfaction && <span className={`${chip} ${s.org_satisfaction === 'no' ? 'border-red-400/50 text-red-300' : 'border-navy-500 text-gray-300'}`}>{t(`survey.org_${s.org_satisfaction}`)}</span>}
                {s.match_balance && <span className={`${chip} ${s.match_balance === 'yes' ? 'border-navy-500 text-gray-300' : 'border-amber-300/50 text-amber-200'}`}>{t('survey.balShort')}: {t(`survey.bal_${s.match_balance}`)}</span>}
                {s.come_back && <span className={`${chip} ${s.come_back === 'no' ? 'border-red-400/50 text-red-300' : 'border-navy-500 text-gray-300'}`}>↩︎ {t(`survey.back_${s.come_back}`)}</span>}
                {s.wants_join && <span className={`${chip} border-lime-400/60 text-lime-300`}>{t('survey.wantsJoin')}</span>}
              </div>
              {s.comment && <p className="text-gray-300 mt-0.5">“{s.comment}”</p>}
            </li>
          ))}
        </ul>
      )}
      <Link href="/club/reviews" className="inline-block mt-3 text-sm text-lime-300 hover:underline">{t('survey.hostAll')} →</Link>
      {share && data.link && <ShareSurvey link={data.link} lang={lang} onClose={() => setShare(false)} />}
    </section>
  );
}

// The shared link + QR: players open it, pick their name and answer (no account needed).
function ShareSurvey({ link, lang, onClose }) {
  const { t } = useI18n();
  const url = typeof window !== 'undefined' ? `${window.location.origin}/s/e/${link.short_code || link.public_token}` : '';
  const [qr, setQr] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!url) return;
    import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(url, { width: 560, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0B1220', light: '#FFFFFF' } }).then(setQr));
  }, [url]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t('survey.shareCopy'), url);
    }
  }
  return (
    <Modal open title={t('survey.shareTitle')} onClose={onClose}>
      <p className="text-gray-300 text-sm">{t('survey.shareLead')}</p>
      <div className="flex justify-center my-4">
        {qr ? <img src={qr} alt={t('survey.shareQr')} className="w-56 h-56 rounded-xl bg-white p-2" /> : <div className="w-56 h-56 rounded-xl bg-navy-800 animate-pulse" aria-hidden />}
      </div>
      <div className="flex items-center gap-2">
        <input className="input flex-1 min-w-0 text-sm" readOnly value={url} aria-label={t('survey.shareTitle')} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn-primary text-sm shrink-0" onClick={copy}>{copied ? `✓ ${t('survey.shareCopied')}` : t('survey.shareCopy')}</button>
      </div>
      {link.closes_at && <p className="text-gray-400 text-sm mt-3">{t('survey.openUntil', { when: whenText(link.closes_at, lang) })} · {t(`survey.win_${link.window}`)}</p>}
      <p className="text-gray-500 text-xs mt-1">{t('survey.shareWindowHint')}</p>
      {qr && (
        <div className="flex justify-end mt-3">
          <a href={qr} download="khao-sat.png" className="btn-secondary text-sm">{t('survey.shareDownload')}</a>
        </div>
      )}
    </Modal>
  );
}
