'use client';
import { QuickProfileModal, QuickBirthModal } from '@/components/QuickProfileModal';
import DuprCard from '@/components/DuprCard';
import PlayerNotices from '@/components/PlayerNotices';
import LinkRequests from '@/components/LinkRequests';
import { levelText } from '@/lib/levels';
import { useState } from 'react';
import Link from 'next/link';
import PlayerShell from '@/components/PlayerShell';
import PaymentCard from '@/components/PaymentCard';
import FormChart from '@/components/FormChart';
import DuprChart from '@/components/DuprChart';
import Modal from '@/components/Modal';
import PlayerQrCard from '@/components/PlayerQrCard';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { localDate } from '@/lib/dates';
import Hint from '@/components/ui/Hint';
import UiIcon from '@/components/ui/UiIcon';

const PAY_STYLE = { paid: 'text-lime-400', pending: 'text-yellow-300', overdue: 'text-red-300' };

function Stat({ label, value, tone = 'text-white' }) {
  return (
    <div className="card !p-3">
      <div className="text-gray-400 text-xs">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

export default function PlayerHome() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { data: me, reload } = useLoad(() => (user ? api.get('/api/player/me') : Promise.resolve(null)), [user?.id]);
  const [qr, setQr] = useState(null);
  const [flash, setFlash] = useState('');
  const [fixOpen, setFixOpen] = useState(null); // 'profile' | 'birth': missing info pop-up

  async function cancel(ref) {
    if (!window.confirm(t('player.cancelConfirm'))) return;
    try {
      await api.del(`/api/player/payments/${ref}`);
      reload();
    } catch (err) {
      window.alert(err.message);
    }
  }

  if (!me) return <PlayerShell><p className="text-gray-400">{t('common.loading')}</p></PlayerShell>;

  const p = me.profile;
  const pending = me.clubs.flatMap((c) => c.pending_payments);
  const sessions = me.clubs.filter((c) => c.membership_state === 'active');
  const sessionsValue = sessions.some((c) => c.sessions_unlimited)
    ? '∞'
    : sessions.length ? sessions.reduce((s, c) => s + (c.sessions_remaining || 0), 0) : '—';

  return (
    <PlayerShell>
      <PlayerNotices notices={me.notices || []} />
      <LinkRequests onChanged={reload} />
      <div className="flex items-center gap-3 mb-4">
        {p?.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatar} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-lime-400" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-navy-700 flex items-center justify-center text-lime-400 text-xl font-bold">
            {(me.username || p?.full_name || me.email || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-white text-xl font-bold break-words">{t('player.hello', { name: me.username || p?.full_name || String(me.email || '').split('@')[0] })}</h1>
          {p?.dupr_level != null && <div className="text-gray-400 text-sm">DUPR {levelText(p.dupr_level, 'pickleball', t)}</div>}
        </div>
      </div>

      {(!p || !p.birth_date) && (
        <button type="button" onClick={() => setFixOpen(p ? 'birth' : 'profile')} className="card block w-full text-left mb-4 border-lime-400/50 text-lime-300 text-sm">
          {p ? t('player.needBirthDate') : t('player.completeProfile')} →
        </button>
      )}

      {flash && (
        <div className="card mb-4 border-lime-400/50 text-lime-300 text-sm flex items-center justify-between gap-3">
          <span>{flash}</span>
          <button className="text-gray-400 text-lg leading-none" aria-label="Close" onClick={() => setFlash('')}>×</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
      {/* Left: my activity — check-in code, sessions left, debt, sessions played, win rate, reviews. */}
      <div className="min-w-0">
      <PlayerQrCard code={me.checkin_code} onRotated={reload} />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Stat label={t('player.sessionsLeft')} value={sessionsValue} tone="text-lime-400" />
        <Stat label={t('player.debt')} value={me.totals.debt ? formatVnd(me.totals.debt) : t('player.noDebt')} tone={me.totals.debt ? 'text-yellow-300' : 'text-gray-300'} />
        <Stat label={t('player.eventsPlayed')} value={me.totals.events} />
        <Stat label={t('player.winRate')} value={me.totals.matches ? `${Math.round((100 * me.totals.wins) / me.totals.matches)}%` : '—'} />
      </div>

      {me.surveys_due?.length > 0 && (
        <section className="card mb-4 border-lime-400/40">
          <h2 className="text-lime-300 font-semibold mb-1">{t('survey.portalTitle')}</h2>
          {me.surveys_due.map((x) => (
            <div key={x.token} className="flex items-center gap-2 py-1 border-b border-navy-700 last:border-0 text-sm">
              <Link href={`/s/${x.token}`} className="flex-1 min-w-0 flex items-center justify-between gap-2 py-1">
                <span className="text-white min-w-0">
                  {x.title}
                  <span className="text-gray-400 text-xs"> · {x.event_date.split('-').reverse().join('/')}{x.club_name ? ` · ${x.club_name}` : ''}</span>
                </span>
                <span className="text-lime-400 whitespace-nowrap">{t('survey.portalCta')} →</span>
              </Link>
              <button
                type="button"
                className="shrink-0 h-11 w-11 inline-flex items-center justify-center text-gray-200 text-xl leading-none hover:text-white"
                aria-label={t('survey.skip')}
                title={t('survey.skip')}
                onClick={() => api.publicPost(`/api/public/surveys/${x.token}/skip`, {}).then(() => reload()).catch(() => {})}
              >
                ✕
              </button>
            </div>
          ))}
        </section>
      )}

      {me.gifts?.length > 0 && (
        <section className="card mb-4 border-pink-300/40">
          <h2 className="text-pink-200 font-semibold mb-1 flex items-center gap-2"><UiIcon name="gift" className="w-5 h-5" />{t('bdays.myGifts')}</h2>
          <ul className="divide-y divide-navy-700">
            {me.gifts.map((g) => (
              <li key={g.id} className="py-2 text-sm">
                <div className="text-white font-medium">{g.kind === 'free_session' ? t('bdays.g_free') : g.kind === 'percent' ? t('bdays.g_percentN', { n: g.percent }) : g.item}</div>
                {g.message && <p className="text-gray-200 whitespace-pre-line break-words">{g.message}</p>}
                <div className="text-gray-400 text-xs">{[g.club_name, g.expires_on ? t('bdays.until', { d: g.expires_on.split('-').reverse().join('/') }) : null].filter(Boolean).join(' · ')}</div>
              </li>
            ))}
          </ul>
          <p className="text-gray-500 text-xs mt-1">{t('bdays.showHost')}</p>
        </section>
      )}

      {pending.length > 0 && (
        <section className="card mb-4 border-yellow-500/40">
          <h2 className="text-yellow-300 font-semibold mb-2">{t('player.waitingPayment')}</h2>
          {pending.map((x) => (
            <div key={x.ref} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-navy-700 last:border-0">
              <div className="text-sm">
                <div className="text-white">{x.club_name} · {x.periods.join(', ')}</div>
                <div className="text-gray-400 text-xs">{formatVnd(x.total)} · {x.ref}</div>
              </div>
              <div className="flex gap-3 text-sm">
                <button className="text-lime-400" onClick={() => setQr(x)}>{t('player.showQr')}</button>
                <button className="text-gray-400" onClick={() => cancel(x.ref)}>{t('player.cancelRequest')}</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {me.event_debts?.length > 0 && (
        <section className="card mb-4 border-yellow-500/40">
          <h2 className="text-yellow-300 font-semibold mb-2">{t('pp.eventDebts')}</h2>
          {me.event_debts.map((d) => (
            <div key={d.event_id} className="flex items-center justify-between gap-2 py-1.5 text-sm border-b border-navy-700 last:border-0">
              <span className="text-gray-200 min-w-0 break-words">
                {d.title} · {localDate(new Date(`${d.event_date}T00:00:00`), lang === 'vi' ? 'vi-VN' : 'en-GB')}
                {d.late_cancel && <span className="ml-2 text-[10px] rounded border border-orange-400/60 text-orange-300 px-1">{t('policy.lateBadge')}</span>}
                {d.extra && <span className="ml-2 text-[10px] rounded border border-amber-300/60 text-amber-200 px-1">{t('feeadj.extraBadge')}</span>}
              </span>
              <span className="text-yellow-300 tabular-nums shrink-0">{formatVnd(d.amount)}</span>
            </div>
          ))}
          <Hint text={t('pp.eventDebtsHint')} className="mt-2" />
        </section>
      )}

      <section className="mb-4">
        <h2 className="text-white font-semibold mb-2">{t('player.myClubs')}</h2>
        {me.clubs.length === 0 && <p className="card text-gray-400 text-sm">{t('player.noClubs')}</p>}
        <div className="flex flex-col gap-3">
          {me.clubs.map((c) => (
            <div key={c.club_id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-white font-semibold">{c.club_name}</div>
                  <div className="text-gray-400 text-xs">{c.current_period ? `${t('player.period')}: ${c.current_period}` : t(`membership.state_${c.membership_state}`)}</div>
                  {c.account_verified === false && <div className="text-yellow-300 text-xs">{t('verify.pendingPlayer')}</div>}
                </div>
                <div className="text-right">
                  <div className="text-lime-400 text-2xl font-bold tabular-nums">
                    {c.membership_state === 'active' ? (c.sessions_unlimited ? '∞' : c.sessions_remaining) : '—'}
                  </div>
                  <div className="text-gray-400 text-xs">{t('player.sessionsLeft')}</div>
                </div>
              </div>
              {c.memberships.length > 0 && (
                <div className="mt-3 flex flex-col gap-1">
                  {c.memberships.slice(0, 6).map((m) => (
                    <div key={m.period_label + m.plan_name} className="flex items-center justify-between text-xs">
                      <span className="text-gray-300">{m.period_label}{m.plan_name ? ` · ${m.plan_name}` : ''}</span>
                      <span className={PAY_STYLE[m.status]}>
                        {t(`membership.${m.status}`)}
                        {m.status === 'paid' && m.sessions_included > 0 && ` · ${m.sessions_used}/${m.sessions_included}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      </div>
      {/* Right: DUPR rating and form. */}
      <div className="min-w-0 lg:sticky lg:top-20">
      <section className="card mb-4">
        <h2 className="text-white font-semibold mb-2">{t('player.dupr')}</h2>
        {me.dupr && (
          <div className="mb-3">
            <DuprCard dupr={me.dupr} onChanged={reload} />
          </div>
        )}
        {me.dupr?.history?.length > 1 ? (
          <DuprChart data={me.dupr.history.map((h) => ({ date: h.date, dupr: h.doubles, source: 'club' })).filter((h) => h.dupr != null)} />
        ) : me.dupr_history?.length ? (
          <DuprChart data={me.dupr_history} />
        ) : (
          !me.dupr?.linked && <p className="text-gray-400 text-sm">{t('player.noDupr')}</p>
        )}
      </section>

      <section className="card">
        <h2 className="text-white font-semibold mb-1">{t('player.form')}</h2>
        {me.form.length ? <FormChart data={me.form} /> : <p className="text-gray-400 text-sm">{t('player.noForm')}</p>}
      </section>
        <Link href="/p/activity" className="block text-right text-lime-300 text-sm font-semibold hover:underline mt-1 min-h-[44px] leading-[44px]">{t('pp2.seeMatches')} →</Link>
      </div>
      </div>


      <Modal open={!!qr} title={t('join.payTitle')} onClose={() => setQr(null)}>
        {qr && <PaymentCard payment={qr} />}
      </Modal>
      <QuickProfileModal open={fixOpen === 'profile'} onClose={() => setFixOpen(null)} onSaved={reload} />
      <QuickBirthModal open={fixOpen === 'birth'} onClose={() => setFixOpen(null)} onSaved={reload} />
    </PlayerShell>
  );
}
