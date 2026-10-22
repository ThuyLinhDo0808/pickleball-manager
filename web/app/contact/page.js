'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/Modal';
import { FeedbackForm } from '@/components/FeedbackButton';
import { Top10Register } from '@/components/Top10';
import { useI18n } from '@/context/I18nContext';
import { useScope } from '@/lib/useScope';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import UiIcon from '@/components/ui/UiIcon';

// Paid features asked for here; the Ban quản trị switches them on per Host.
const ADDONS = [
  { kind: 'finance_pro', icon: 'chart' },
  { kind: 'coach_manager', icon: 'user' },
  { kind: 'tournament_manager', icon: 'court' },
];

// Báo lỗi / Liên hệ nhà phát triển: 1) report a problem, 2) ask for a paid feature
// (Top 10 cộng đồng uy tín, Phân tích tài chính, Coach Manager, Tournament Manager).
export default function ContactPage() {
  const { t } = useI18n();
  const { club, community } = useScope();
  const { data: dev, reload: reloadDev } = useLoad(() => api.get('/api/host/dev-requests'), []);
  const { data: featured, reload: reloadFeatured } = useLoad(() => (community && club ? api.get(`/api/clubs/${club.id}/featured`) : Promise.resolve(null)), [community, club?.id]);
  const [top10, setTop10] = useState(false);
  const [ask, setAsk] = useState(null); // addon kind
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // /contact?top10=1 (old Top 10 page, Chỉ số page) opens the Top 10 form.
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('top10') && community) setTop10(true);
  }, [community]);

  async function send() {
    setBusy(true);
    setErr('');
    try {
      await api.post('/api/host/dev-requests', { kind: ask, note, club_id: club?.id });
      await reloadDev();
      setAsk(null);
      setNote('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel(kind) {
    if (!window.confirm(t('contact.cancelAsk'))) return;
    try {
      await api.del(`/api/host/dev-requests/${kind}`);
      await reloadDev();
    } catch (e) {
      window.alert(e.message);
    }
  }

  const cur = featured?.current;
  const statusOf = (kind) => {
    if (dev?.addons?.[kind]) return { tone: 'text-lime-300', text: `✓ ${t('contact.st_on')}` };
    const r = dev?.requests?.[kind];
    if (r?.status === 'open') return { tone: 'text-sky-300', text: t('contact.st_open') };
    if (r?.status === 'rejected') return { tone: 'text-red-300', text: `${t('contact.st_rejected')}${r.owner_note ? `: ${r.owner_note}` : ''}` };
    return null;
  };

  return (
    <AppShell>
      <PageHeader icon="chat" title={t('contact.title')} subtitle={t('contact.subtitle')} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
        <section className="card">
          <h2 className="text-white font-semibold mb-2">1. {t('contact.part1')}</h2>
          <FeedbackForm />
        </section>

        <section id="dev" className="card">
          <h2 className="text-white font-semibold">2. {t('contact.part2')}</h2>
          <p className="text-gray-400 text-sm mb-3">{t('contact.part2Hint')}</p>
          <ul className="flex flex-col gap-2">
            <li className="rounded-xl border border-navy-600 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold">{t('contact.top10Title')}</p>
                  <p className="text-gray-400 text-sm">{t('contact.top10Ask')}</p>
                  {cur && <p className="text-sky-300 text-xs mt-1">{t(`featured.st_${cur.status}`)}</p>}
                  {!cur && featured?.reputation && (
                    <p className={`text-xs mt-1 ${featured.reputation.eligible ? 'text-lime-300' : 'text-amber-200'}`}>
                      {featured.reputation.eligible ? `✓ ${t('top10.eligible')}` : t('top10.cardNotYet', { ok: featured.reputation.checks.length - featured.reputation.failing.length, total: featured.reputation.checks.length })}
                    </p>
                  )}
                  {!community && <p className="text-amber-200 text-xs mt-1">{t('contact.top10NeedCommunity')}</p>}
                </div>
                <button type="button" className="btn-primary text-sm max-sm:w-full" disabled={!community} onClick={() => setTop10(true)}>
                  {cur ? t('contact.view') : featured?.reputation && !featured.reputation.eligible ? t('top10.seeRules') : t('contact.register')}
                </button>
              </div>
            </li>
            {ADDONS.map(({ kind, icon }) => {
              const st = statusOf(kind);
              const open = dev?.requests?.[kind]?.status === 'open';
              return (
                <li key={kind} className="rounded-xl border border-navy-600 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-semibold">
                        <UiIcon name={icon} className="inline-block w-4 h-4 mr-1.5 -mt-0.5 text-gray-400" />{t(`contact.a_${kind}`)} <span className="ml-1 rounded-full border border-amber-300/40 px-2 py-0.5 text-[11px] font-normal text-amber-200 whitespace-nowrap">{t('contact.soon')}</span>
                      </p>
                      <p className="text-gray-400 text-sm">{t(`contact.q_${kind}`)}</p>
                      {st && <p className={`text-xs mt-1 ${st.tone}`}>{st.text}</p>}
                    </div>
                    {dev?.addons?.[kind] ? null : open ? (
                      <button type="button" className="btn-secondary text-sm max-sm:w-full" onClick={() => cancel(kind)}>{t('contact.cancel')}</button>
                    ) : (
                      <button type="button" className="btn-primary text-sm max-sm:w-full" disabled={dev && !dev.ready} onClick={() => { setAsk(kind); setErr(''); }}>{t('contact.register')}</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {dev && !dev.ready && <p className="text-amber-200 text-xs mt-2">{t('contact.migration')}</p>}
        </section>
      </div>

      <Modal open={top10} title={`${t('contact.top10Title')}`} onClose={() => setTop10(false)}>
        {community && club && <Top10Register club={club} data={featured} reload={reloadFeatured} />}
      </Modal>

      <Modal open={!!ask} title={ask ? t(`contact.a_${ask}`) : ''} onClose={() => setAsk(null)}>
        {ask && (
          <div className="flex flex-col gap-3">
            <p className="text-gray-200">{t(`contact.q_${ask}`)}</p>
            <p className="text-gray-400 text-sm">{t('contact.askHint')}</p>
            <div>
              <label className="text-xs text-gray-400" htmlFor="dev-note">{t('contact.noteLabel')}</label>
              <textarea id="dev-note" className="input" rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('contact.notePh')} />
            </div>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <div className="flex justify-end">
              <button type="button" className="btn-primary max-sm:w-full sm:px-8" disabled={busy} onClick={send}>{t('contact.send')}</button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
