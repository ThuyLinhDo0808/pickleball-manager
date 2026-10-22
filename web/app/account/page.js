'use client';
// Every report (Góp ý, Báo lỗi / Liên hệ) goes to the developer's inbox.
const DEV_FEEDBACK_EMAIL = 'pickleball.web.ltsocial@gmail.com';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import SettingsSection from '@/components/SettingsSection';
import HostPaymentSettings from '@/components/HostPaymentSettings';
import HostContactPhone from '@/components/HostContactPhone';
import DeleteAccount from '@/components/DeleteAccount';
import AccountDetails from '@/components/AccountDetails';
import AccountSecurity from '@/components/AccountSecurity';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useClubs } from '@/context/ClubContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { exportClubBackup } from '@/lib/exportExcel';
import { planFor, hasFeature, lockedNotice } from '@/lib/planFeatures';
import { useWorkspace } from '@/context/WorkspaceContext';
import { SocialManagerPanel, UpgradeModal } from '@/components/PlanModals';
import { localDate } from '@/lib/dates';
import UiIcon from '@/components/ui/UiIcon';

const SECTIONS = [
  ['login', 'key'],
  ['security', 'lock'],
  ['manage', 'court'],
  ['plan', 'gem'],
  ['payout', 'bank'],
  ['backup', 'list'],
  ['feedback', 'chat'],
  ['danger', 'alert'],
];

// Account settings: who you are and your plan up top, then one section per setting.
export default function AccountPage() {
  const { t, lang } = useI18n();
  const { user, signOut } = useAuth();
  const { allClubs: clubs } = useClubs(); // clubs and communities
  const { club } = useDefaultClub();
  const { data: sub } = useLoad(() => api.get('/api/host/subscription').catch(() => null), []);
  const { data: me } = useLoad(() => api.get('/api/host/me').catch(() => null), []);
  const { data: requests } = useLoad(() => api.get('/api/host/club-requests').catch(() => null), []);
  const lastRequest = requests?.items?.[0] || null;
  const { plan } = useWorkspace();
  const [upgrading, setUpgrading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  // One section at a time (tabs), opened from the link's #hash (e.g. /account#payout).
  const [tab, setTab] = useState('login');
  useEffect(() => {
    const pick = () => {
      const h = window.location.hash.slice(1);
      if (SECTIONS.some(([id]) => id === h)) setTab(h);
    };
    pick();
    window.addEventListener('hashchange', pick);
    return () => window.removeEventListener('hashchange', pick);
  }, []);

  const usage = sub?.usage;
  const pct = usage?.capacity_limit ? Math.min(100, Math.round((100 * usage.used) / usage.capacity_limit)) : 0;
  const email = user?.email || '';
  const name = me?.username || me?.full_name || email.split('@')[0];
  const since = me?.created_at ? localDate(new Date(me.created_at), lang === 'vi' ? 'vi-VN' : 'en-GB', { month: '2-digit', year: 'numeric' }) : null;

  async function onBackup() {
    if (!club) return;
    if (!hasFeature(planFor(club, plan), 'full_export')) return lockedNotice('full_export');
    setBackupBusy(true);
    try {
      const [members, events, rankings] = await Promise.all([
        api.get(`/api/clubs/${club.id}/members`),
        api.get(`/api/clubs/${club.id}/events`),
        api.get(`/api/clubs/${club.id}/rankings`),
      ]);
      exportClubBackup(club, members, events, rankings, t);
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
      <div className="relative overflow-hidden rounded-xl border border-navy-700 bg-navy-800 p-4 mb-3">
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="h-12 w-12 shrink-0 rounded-xl bg-lime-400 text-navy-950 text-2xl font-bold flex items-center justify-center">
            {(name || '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-gray-400 text-xs">{t('acct.kicker')}</p>
            <h1 className="text-white text-xl sm:text-2xl font-bold break-words">{name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm">
              <span className="text-gray-300 break-all">{email}</span>
              {user?.email_confirmed_at && (
                <span className="text-[11px] rounded-full border border-lime-400/50 text-lime-300 px-2 py-0.5">✓ {t('acct.verified')}</span>
              )}
              {sub && <span className="text-[11px] rounded-full bg-amber-300 text-navy-950 font-bold px-2 py-0.5">{sub.tier === 'free' ? t('plan.noPlan') : sub.tier}</span>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
            {[
              [clubs.length, t('acct.statClubs')],
              [usage ? `${usage.used}` : '—', t('acct.statUsed')],
              [since || '—', t('acct.statSince')],
            ].map(([v, k]) => (
              <div key={k} className="rounded-lg bg-navy-950/60 border border-navy-700 px-2.5 py-1.5 text-center">
                <div className="text-white font-bold tabular-nums break-words capitalize">{v}</div>
                <div className="text-gray-400 text-[11px]">{k}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section links */}
      <nav aria-label={t('acct.jump')} role="tablist" className="flex flex-wrap gap-2 mb-1">
        {SECTIONS.map(([id, icon]) => (
          <a
            key={id}
            href={`#${id}`}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${tab === id ? (id === 'danger' ? 'border-red-400 bg-red-500/15 text-red-200 font-semibold' : 'border-lime-400 bg-lime-400/15 text-lime-200 font-semibold') : id === 'danger' ? 'border-red-500/40 text-red-300 hover:bg-red-500/10' : 'border-navy-600 text-gray-300 hover:border-lime-400 hover:text-lime-300'}`}
          >
            <UiIcon name={icon} className="w-4 h-4 shrink-0" /> {id === 'login' ? t('auth.detailsTitle') : t(`acct.s_${id}`)}
          </a>
        ))}
      </nav>

      <div className="flex flex-col">
        <SettingsSection id="login" hidden={tab !== 'login'} icon="key" tone="lime" title={t('auth.detailsTitle')} description={t('auth.detailsHint')}>
          <AccountDetails />
          {/* Hosts: the phone players see on quick booking pages (join / pass a ticket on). */}
          {clubs.length > 0 && <HostContactPhone />}
        </SettingsSection>

        {/* Two-step sign-in, devices, sign out everywhere. */}
        <SettingsSection id="security" hidden={tab !== 'security'} icon="lock" tone="lime" title={t('acct.s_security')} description={t('sec.sectionHint')}>
          <AccountSecurity />
        </SettingsSection>

        {/* Players become club managers here: a club request the app owner approves. */}
        <SettingsSection id="manage" hidden={tab !== 'manage'} icon="court" tone="lime" title={t('acct.s_manage')} description={t('acct.manageHint')}>
          {lastRequest && (
            <p className="mb-3 text-sm text-gray-200">
              {t('acct.lastRequest', { name: lastRequest.name })}: <b>{t(`creq.status_${lastRequest.status}`)}</b>
              {lastRequest.owner_note ? <span className="block text-gray-400 text-xs">{lastRequest.owner_note}</span> : null}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-gray-400 text-sm min-w-0 flex-1">{clubs.length ? t('acct.manageMoreBoth', { n: clubs.filter((c) => c.kind !== 'community').length, m: clubs.filter((c) => c.kind === 'community').length }) : t('acct.manageFirst')}</p>
            <Link href="/club-request" className="btn-primary">{lastRequest?.status === 'pending' ? t('acct.manageSeeRequest') : t('acct.manageApply')}</Link>
          </div>
        </SettingsSection>

        <SettingsSection id="plan" hidden={tab !== 'plan'} icon="gem" tone="amber" title={t('acct.s_plan')} description={t('acct.planHint')}>
          {plan ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-gray-400 text-xs">{t('acct.currentPlan')}</div>
                  <div className="text-white text-2xl font-bold">{plan.tier === 'free' ? t('plan.noPlan') : plan.tier}</div>
                </div>
                <div className="text-right text-sm">
                  <div className="text-white font-semibold">
                    {plan.limits?.fixed == null ? t('plan.membersUnlimited') : t('plan.membersN', { fixed: plan.limits.fixed, guest: plan.limits.guest })}
                  </div>
                  <div className="text-gray-400 text-xs">{t('plan.perClub')}</div>
                </div>
              </div>
              {plan.no_plan && (
                <p className="mt-3 rounded-lg border border-red-400/40 bg-red-500/5 px-3 py-2 text-red-200 text-sm">{plan.clubs_owned ? t('plan.noPlanClubs') : t('plan.noPlanHint')}</p>
              )}
              {plan.trial ? (
                <p className="mt-3 rounded-lg border border-amber-300/40 bg-amber-300/5 px-3 py-2 text-amber-200 text-sm">
                  {t('plan.trialBanner', { tier: plan.trial.tier.toUpperCase(), date: plan.trial.ends_on.split('-').reverse().join('/') })}
                </p>
              ) : plan.tier_paid_until ? (
                <p className="text-gray-400 text-xs mt-2">{t('plan.paidUntil', { date: plan.tier_paid_until.split('-').reverse().join('/') })}</p>
              ) : null}
            </>
          ) : (
            <p className="text-gray-400 text-sm">{t('common.loading')}</p>
          )}
          {plan && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-700 bg-navy-900/60 px-3 py-2.5">
              <span className="text-sm text-gray-200">
                {t('plan.clubUsage', { owned: plan.clubs_owned, limit: plan.club_limit ?? '∞' })}
              </span>
              <button type="button" className="btn-secondary !py-1.5 text-sm" onClick={() => setUpgrading(true)}>{t('plan.changeBtn')}</button>
            </div>
          )}
          <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4">
            <SocialManagerPanel />
          </div>
          {plan?.is_owner && (
            <Link href="/owner" className="mt-3 block rounded-xl border border-sky-400/40 bg-sky-400/5 px-3 py-2.5 text-sm text-sky-200 hover:bg-sky-400/10">
              {t('admin.link')} →
            </Link>
          )}
          <UpgradeModal open={upgrading} onClose={() => setUpgrading(false)} />
        </SettingsSection>

        <SettingsSection id="payout" hidden={tab !== 'payout'} icon="bank" tone="lime" title={t('paySet.title')} description={t('paySet.hint')}>
          <HostPaymentSettings bare />
        </SettingsSection>


        <SettingsSection id="backup" hidden={tab !== 'backup'} icon="list" tone="violet" title={t('acct.s_backup')} description={t('acct.backupHint')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-white font-semibold break-words">{club?.name || '—'}</div>
              <div className="text-gray-400 text-xs">{t('acct.backupWhat')}</div>
            </div>
            <button className="btn-secondary" onClick={onBackup} disabled={!club || backupBusy}>{t('common.exportExcel')}</button>
          </div>
        </SettingsSection>

        <SettingsSection id="feedback" hidden={tab !== 'feedback'} icon="chat" tone="sky" title={t('acct.s_feedback')} description={t('acct.feedbackHint')}>
          {sent ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-lime-300 text-sm">✓ {t('acct.feedbackSent')}</p>
              <button type="button" className="btn-secondary text-sm" onClick={() => setSent(false)}>{t('acct.feedbackMore')}</button>
            </div>
          ) : (
            <form onSubmit={sendFeedback} className="flex flex-col gap-3">
              <textarea className="input min-h-[7rem]" required maxLength={4000} placeholder={t('acct.feedbackPh')} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-500 text-xs">{t('acct.feedbackFrom', { email: DEV_FEEDBACK_EMAIL })}</span>
                <button className="btn-primary" disabled={busy || !feedback.trim()}>{t('acct.send')}</button>
              </div>
            </form>
          )}
        </SettingsSection>

        <SettingsSection id="danger" hidden={tab !== 'danger'} icon="alert" danger title={t('acct.s_danger')} description={t('deleteAccount.intro')}>
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
