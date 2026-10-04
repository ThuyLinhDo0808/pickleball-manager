'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import SettingsSection from '@/components/SettingsSection';
import NotifySettings from '@/components/NotifySettings';
import HostPaymentSettings from '@/components/HostPaymentSettings';
import DeleteAccount from '@/components/DeleteAccount';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useClubs } from '@/context/ClubContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { exportClubBackup } from '@/lib/exportExcel';

const SECTIONS = [
  ['plan', '💎'],
  ['payout', '🏦'],
  ['notify', '🔔'],
  ['backup', '🗂️'],
  ['feedback', '💬'],
  ['danger', '⚠️'],
];

// Account settings: who you are and your plan up top, then one section per setting.
export default function AccountPage() {
  const { t, lang } = useI18n();
  const { user, signOut } = useAuth();
  const { clubs } = useClubs();
  const { club } = useDefaultClub();
  const { data: sub } = useLoad(() => api.get('/api/host/subscription').catch(() => null), []);
  const { data: me } = useLoad(() => api.get('/api/host/me').catch(() => null), []);
  const [feedback, setFeedback] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

  const usage = sub?.usage;
  const pct = usage?.capacity_limit ? Math.min(100, Math.round((100 * usage.used) / usage.capacity_limit)) : 0;
  const email = user?.email || '';
  const name = me?.full_name || email.split('@')[0];
  const since = me?.created_at ? new Date(me.created_at).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { month: '2-digit', year: 'numeric' }) : null;

  async function onBackup() {
    if (!club) return;
    setBackupBusy(true);
    try {
      const [members, events, rankings] = await Promise.all([
        api.get(`/api/clubs/${club.id}/members`),
        api.get(`/api/clubs/${club.id}/events`),
        api.get(`/api/clubs/${club.id}/rankings`),
      ]);
      exportClubBackup(club, members, events, rankings);
    } finally {
      setBackupBusy(false);
    }
  }

  async function sendFeedback(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/host/feedback', { message: feedback, contact: user?.email });
      setFeedback('');
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      {/* Profile header */}
      <div className="relative overflow-hidden rounded-2xl border border-navy-700 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-5 sm:p-7 mb-4">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-lime-400/10 blur-2xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 rounded-2xl bg-lime-400 text-navy-950 text-3xl font-bold flex items-center justify-center shadow-lg shadow-lime-400/20">
            {(name || '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-gray-400 text-xs uppercase tracking-wider">{t('acct.kicker')}</p>
            <h1 className="text-white text-2xl sm:text-3xl font-bold truncate">{name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm">
              <span className="text-gray-300 truncate">{email}</span>
              {user?.email_confirmed_at && (
                <span className="text-[11px] rounded-full border border-lime-400/50 text-lime-300 px-2 py-0.5">✓ {t('acct.verified')}</span>
              )}
              {sub && <span className="text-[11px] rounded-full bg-amber-300 text-navy-950 font-bold px-2 py-0.5 uppercase">{sub.tier}</span>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
            {[
              [clubs.length, t('acct.statClubs')],
              [usage ? `${usage.used}` : '—', t('acct.statUsed')],
              [since || '—', t('acct.statSince')],
            ].map(([v, k]) => (
              <div key={k} className="rounded-xl bg-navy-950/60 border border-navy-700 px-3 py-2 text-center min-w-[6rem]">
                <div className="text-white font-bold tabular-nums truncate capitalize">{v}</div>
                <div className="text-gray-400 text-[11px]">{k}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section links */}
      <nav aria-label={t('acct.jump')} className="sticky top-0 z-10 -mx-1 px-1 py-2 mb-2 bg-navy-950/90 backdrop-blur flex gap-2 overflow-x-auto">
        {SECTIONS.map(([id, icon]) => (
          <a
            key={id}
            href={`#${id}`}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${id === 'danger' ? 'border-red-500/40 text-red-300 hover:bg-red-500/10' : 'border-navy-600 text-gray-300 hover:border-lime-400 hover:text-lime-300'}`}
          >
            <span aria-hidden="true">{icon}</span> {t(`acct.s_${id}`)}
          </a>
        ))}
      </nav>

      <div className="flex flex-col">
        <SettingsSection id="plan" icon="💎" tone="amber" title={t('acct.s_plan')} description={t('acct.planHint')}>
          {usage ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-gray-400 text-xs uppercase tracking-wide">{t('acct.currentPlan')}</div>
                  <div className="text-white text-2xl font-bold uppercase">{sub.tier}</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold tabular-nums">{usage.used}/{usage.capacity_limit}</div>
                  <div className="text-gray-400 text-xs">{t('acct.usageLabel')}</div>
                </div>
              </div>
              <div className="w-full bg-navy-900 rounded-full h-2.5 mt-3 overflow-hidden">
                <div className={`h-2.5 rounded-full ${pct > 85 ? 'bg-red-400' : pct > 60 ? 'bg-amber-300' : 'bg-lime-400'}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-gray-400 text-xs mt-2">{t('acct.usageLeft', { n: usage.remaining, pct })}</p>
            </>
          ) : (
            <p className="text-gray-400 text-sm">{t('common.loading')}</p>
          )}
        </SettingsSection>

        <SettingsSection id="payout" icon="🏦" tone="lime" title={t('paySet.title')} description={t('paySet.hint')}>
          <HostPaymentSettings bare />
        </SettingsSection>

        <SettingsSection id="notify" icon="🔔" tone="sky" title={t('notify.title')} description={t('notify.hint')}>
          <NotifySettings bare />
        </SettingsSection>

        <SettingsSection id="backup" icon="🗂️" tone="violet" title={t('acct.s_backup')} description={t('acct.backupHint')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-white font-semibold truncate">{club?.name || '—'}</div>
              <div className="text-gray-400 text-xs">{t('acct.backupWhat')}</div>
            </div>
            <button className="btn-secondary" onClick={onBackup} disabled={!club || backupBusy}>⬇ {t('common.exportExcel')}</button>
          </div>
        </SettingsSection>

        <SettingsSection id="feedback" icon="💬" tone="sky" title={t('acct.s_feedback')} description={t('acct.feedbackHint')}>
          {sent ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-lime-300 text-sm">✓ {t('acct.feedbackSent')}</p>
              <button type="button" className="btn-secondary text-sm" onClick={() => setSent(false)}>{t('acct.feedbackMore')}</button>
            </div>
          ) : (
            <form onSubmit={sendFeedback} className="flex flex-col gap-3">
              <textarea className="input min-h-[7rem]" required maxLength={4000} placeholder={t('acct.feedbackPh')} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-500 text-xs">{t('acct.feedbackFrom', { email })}</span>
                <button className="btn-primary" disabled={busy || !feedback.trim()}>{t('acct.send')}</button>
              </div>
            </form>
          )}
        </SettingsSection>

        <SettingsSection id="danger" icon="⚠️" danger title={t('acct.s_danger')} description={t('deleteAccount.intro')}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-navy-700">
              <div>
                <div className="text-white font-semibold">{t('acct.signOutTitle')}</div>
                <div className="text-gray-400 text-xs">{t('acct.signOutHint')}</div>
              </div>
              <button type="button" className="btn-secondary" onClick={() => signOut()}>{t('nav.signOut')}</button>
            </div>
            <DeleteAccount bare />
          </div>
        </SettingsSection>
      </div>
    </AppShell>
  );
}
