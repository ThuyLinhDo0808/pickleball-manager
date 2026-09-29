'use client';
import { useState } from 'react';
import Link from 'next/link';
import PlayerShell from '@/components/PlayerShell';
import PaymentCard from '@/components/PaymentCard';
import FormChart from '@/components/FormChart';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

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
  const { data: me, loading, reload } = useLoad(() => (user ? api.get('/api/player/me') : Promise.resolve(null)), [user?.id]);
  const [qr, setQr] = useState(null);

  async function cancel(ref) {
    if (!window.confirm(t('player.cancelConfirm'))) return;
    try {
      await api.del(`/api/player/payments/${ref}`);
      reload();
    } catch (err) {
      window.alert(err.message);
    }
  }

  if (loading || !me) return <PlayerShell><p className="text-gray-400">{t('common.loading')}</p></PlayerShell>;

  const p = me.profile;
  const pending = me.clubs.flatMap((c) => c.pending_payments);
  const sessions = me.clubs.filter((c) => c.membership_state === 'active');
  const sessionsValue = sessions.some((c) => c.sessions_unlimited)
    ? '∞'
    : sessions.length ? sessions.reduce((s, c) => s + (c.sessions_remaining || 0), 0) : '—';

  return (
    <PlayerShell>
      <div className="flex items-center gap-3 mb-4">
        {p?.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatar} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-lime-400" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-navy-700 flex items-center justify-center text-lime-400 text-xl font-bold">
            {(p?.full_name || me.email || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-white text-xl font-bold truncate">{t('player.hello', { name: p?.full_name || me.email })}</h1>
          {p?.dupr_level != null && <div className="text-gray-400 text-sm">DUPR {p.dupr_level}</div>}
        </div>
      </div>

      {!p && (
        <Link href="/p/profile" className="card block mb-4 border-lime-400/50 text-lime-300 text-sm">
          {t('player.completeProfile')} →
        </Link>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label={t('player.sessionsLeft')} value={sessionsValue} tone="text-lime-400" />
        <Stat label={t('player.debt')} value={me.totals.debt ? formatVnd(me.totals.debt) : t('player.noDebt')} tone={me.totals.debt ? 'text-yellow-300' : 'text-gray-300'} />
        <Stat label={t('player.eventsPlayed')} value={me.totals.events} />
        <Stat label={t('player.winRate')} value={me.totals.matches ? `${Math.round((100 * me.totals.wins) / me.totals.matches)}%` : '—'} />
      </div>

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

      <section className="card mb-4">
        <h2 className="text-white font-semibold mb-1">{t('player.form')}</h2>
        {me.form.length ? <FormChart data={me.form} /> : <p className="text-gray-400 text-sm">{t('player.noForm')}</p>}
      </section>

      <section className="card">
        <h2 className="text-white font-semibold mb-2">{t('player.history')}</h2>
        {me.history.length === 0 && <p className="text-gray-400 text-sm">{t('player.noHistory')}</p>}
        <div className="flex flex-col divide-y divide-navy-700">
          {me.history.map((h) => {
            const body = (
              <>
                <div className="min-w-0">
                  <div className="text-white text-sm truncate">{h.title}</div>
                  <div className="text-gray-400 text-xs">
                    {new Date(`${h.event_date}T00:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB')}
                    {h.club_name ? ` · ${h.club_name}` : ''}
                  </div>
                </div>
                <span className={`text-xs shrink-0 ${h.status === 'checked_in' ? 'text-lime-400' : h.status === 'no_show' ? 'text-red-300' : 'text-gray-400'}`}>
                  {t(`player.status_${h.status}`)}
                </span>
              </>
            );
            return h.link ? (
              <Link key={h.event_id} href={`/e/${h.link}`} className="flex items-center justify-between gap-3 py-2">{body}</Link>
            ) : (
              <div key={h.event_id} className="flex items-center justify-between gap-3 py-2">{body}</div>
            );
          })}
        </div>
      </section>

      <p className="text-center mt-6">
        <Link href="/dashboard" className="text-gray-500 text-xs underline">{t('player.hostApp')} →</Link>
      </p>

      <Modal open={!!qr} title={t('join.payTitle')} onClose={() => setQr(null)}>
        {qr && <PaymentCard payment={qr} />}
      </Modal>
    </PlayerShell>
  );
}
