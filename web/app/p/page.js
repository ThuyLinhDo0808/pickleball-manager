'use client';
import DuprCard from '@/components/DuprCard';
import PlayerNotices from '@/components/PlayerNotices';
import LinkRequests from '@/components/LinkRequests';
import { levelText } from '@/lib/levels';
import { useEffect, useState } from 'react';
import { CancelDialog, CancelLine } from '@/components/CancelHistory';
import { refundIfCancelNow } from '@/lib/cancelPolicy';
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
import { VoucherChip } from '@/components/RaceBoard';
import { localDate } from '@/lib/dates';
import Hint from '@/components/ui/Hint';

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
  const [cancelling, setCancelling] = useState(null); // history row being cancelled
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState('');

  function cancelEvent(h) {
    setCancelErr('');
    setCancelling(h);
  }
  async function doCancel(reason) {
    const h = cancelling;
    setCancelBusy(true);
    setCancelErr('');
    try {
      const r = await api.post(`/api/player/participations/${h.participant_id}/cancel`, { reason });
      setCancelling(null);
      const pct = r.refund_percent ?? (r.late ? 0 : 100);
      setFlash(pct === 100 ? t('pp.cancelled') : pct === 50 ? t(h.fee_paid ? 'cancelx.doneHalf' : 'cancelx.doneHalfOwe') : t('pp.cancelledLate'));
      reload();
    } catch (err) {
      setCancelErr(err.message);
    } finally {
      setCancelBusy(false);
    }
  }

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
          <h1 className="text-white text-xl font-bold truncate">{t('player.hello', { name: me.username || p?.full_name || String(me.email || '').split('@')[0] })}</h1>
          {(p?.dupr_level != null || p?.badminton_level != null) && (
            <div className="text-gray-400 text-sm">
              {[p.dupr_level != null && `🏓 DUPR ${levelText(p.dupr_level, 'pickleball', t)}`, p.badminton_level != null && `🏸 ${levelText(p.badminton_level, 'badminton', t)}`].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      </div>

      {(!p || !p.birth_date) && (
        <Link href="/p/profile" className="card block mb-4 border-lime-400/50 text-lime-300 text-sm">
          {p ? t('player.needBirthDate') : t('player.completeProfile')} →
        </Link>
      )}

      {flash && (
        <div className="card mb-4 border-lime-400/50 text-lime-300 text-sm flex items-center justify-between gap-3">
          <span>{flash}</span>
          <button className="text-gray-400 text-lg leading-none" aria-label="Close" onClick={() => setFlash('')}>×</button>
        </div>
      )}

      <PlayerQrCard code={me.checkin_code} onRotated={reload} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label={t('player.sessionsLeft')} value={sessionsValue} tone="text-lime-400" />
        <Stat label={t('player.debt')} value={me.totals.debt ? formatVnd(me.totals.debt) : t('player.noDebt')} tone={me.totals.debt ? 'text-yellow-300' : 'text-gray-300'} />
        <Stat label={t('player.eventsPlayed')} value={me.totals.events} />
        <Stat label={t('player.winRate')} value={me.totals.matches ? `${Math.round((100 * me.totals.wins) / me.totals.matches)}%` : '—'} />
      </div>

      {/* Top-month prizes still to use (or used / expired lately). */}
      {me.vouchers?.some((v) => v.state === 'available') && (
        <section className="card mb-4 border-amber-300/40">
          <h2 className="text-amber-200 font-semibold mb-2">🎁 {t('race.myVouchers')}</h2>
          <ul className="flex flex-col gap-2">{me.vouchers.filter((v) => v.state === 'available').map((v) => <VoucherChip key={v.id} v={v} />)}</ul>
          <p className="text-gray-500 text-xs mt-2">{t('race.autoApply')}</p>
        </section>
      )}

      {me.surveys_due?.length > 0 && (
        <section className="card mb-4 border-lime-400/40">
          <h2 className="text-lime-300 font-semibold mb-1">🙏 {t('survey.portalTitle')}</h2>
          {me.surveys_due.map((x) => (
            <Link key={x.token} href={`/s/${x.token}`} className="flex items-center justify-between gap-2 py-2 border-b border-navy-700 last:border-0 text-sm">
              <span className="text-white min-w-0">
                {x.title}
                <span className="text-gray-400 text-xs"> · {x.event_date.split('-').reverse().join('/')}{x.club_name ? ` · ${x.club_name}` : ''}</span>
              </span>
              <span className="text-lime-400 whitespace-nowrap">{t('survey.portalCta')} →</span>
            </Link>
          ))}
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
              <span className="text-gray-200 min-w-0 truncate">
                {d.title} · {localDate(new Date(`${d.event_date}T00:00:00`), lang === 'vi' ? 'vi-VN' : 'en-GB')}
                {d.late_cancel && <span className="ml-2 text-[10px] rounded border border-orange-400/60 text-orange-300 px-1">{t('policy.lateBadge')}</span>}
              </span>
              <span className="text-yellow-300 tabular-nums shrink-0">{formatVnd(d.amount)}</span>
            </div>
          ))}
          <Hint text={t('pp.eventDebtsHint')} className="mt-2" />
        </section>
      )}

      {/* Updates reach players on the 🔔 bell (no e-mail setting any more). */}
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
                  {c.account_verified === false && <div className="text-yellow-300 text-xs">⏳ {t('verify.pendingPlayer')}</div>}
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
        <h2 className="text-white font-semibold mb-2">{t('player.dupr')}</h2>
        {me.dupr && (
          <div className="mb-3">
            <DuprCard dupr={me.dupr} />
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

      <section className="card mb-4">
        <h2 className="text-white font-semibold mb-1">{t('player.form')}</h2>
        {me.form.length ? <FormChart data={me.form} /> : <p className="text-gray-400 text-sm">{t('player.noForm')}</p>}
      </section>

      <section className="card">
        <h2 className="text-white font-semibold mb-2">{t('player.history')}</h2>
        {me.history.length === 0 && <p className="text-gray-400 text-sm">{t('player.noHistory')}</p>}
        {cancelling && (
          <CancelDialog
            open
            percent={refundIfCancelNow({ deadline: cancelling.cancel_deadline, halfDeadline: cancelling.half_deadline, status: cancelling.status })}
            fee={cancelling.fee}
            paid={!!cancelling.fee_paid}
            busy={cancelBusy}
            error={cancelErr}
            onClose={() => setCancelling(null)}
            onConfirm={doCancel}
          />
        )}
        <div className="flex flex-col divide-y divide-navy-700">
          {me.history.map((h) => {
            const deadline = h.cancel_deadline && new Date(h.cancel_deadline);
            const fmtAt = (d) => localDate(d, lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }, true);
            const info = (
              <div className="min-w-0">
                <div className="text-white text-sm break-words">{h.title}</div>
                <div className="text-gray-400 text-xs">
                  {localDate(new Date(`${h.event_date}T00:00:00`), lang === 'vi' ? 'vi-VN' : 'en-GB')}
                  {h.start_time ? ` · ${h.start_time.slice(0, 5)}` : ''}
                  {h.club_name ? ` · ${h.club_name}` : ''}
                </div>
                {h.can_cancel && h.status === 'registered' && deadline && (
                  <div className={`text-[11px] ${new Date() > deadline ? 'text-orange-300' : 'text-gray-500'}`}>
                    {new Date() <= deadline
                      ? t('pp.freeUntil', { at: fmtAt(deadline) })
                      : h.half_deadline && new Date() <= new Date(h.half_deadline)
                        ? t('cancelx.halfUntil', { at: fmtAt(new Date(h.half_deadline)) })
                        : t('pp.pastDeadline')}
                  </div>
                )}
                {h.status === 'cancelled' && (h.cancelled_at || h.cancel_reason) && (
                  <div className="text-[11px] text-gray-500">
                    {h.cancelled_at && `${t('cancelx.cancelledAt', { at: fmtAt(new Date(h.cancelled_at)) })} · `}
                    <CancelLine item={{ refund_percent: h.refund_percent, by: h.cancelled_by, reason: h.cancel_reason }} fee={h.fee} paid={!!h.fee_paid} />
                  </div>
                )}
              </div>
            );
            return (
              <div key={h.event_id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  {h.link ? <Link href={`/e/${h.link}`}>{info}</Link> : info}
                  {h.ticket_code && (
                    <Link href={`/t/${h.ticket_code}`} className="text-lime-400 text-xs font-semibold">🎟 {t('pp.ticket')}</Link>
                  )}
                  {h.status === 'pending' && h.link && (
                    <Link href={`/e/${h.link}`} className="text-yellow-300 text-xs font-semibold">
                      {h.payment_status === 'proof_submitted' ? `⏳ ${t('signup.hostChecking')}` : `💸 ${t('pp.payNow')}`}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs ${h.status === 'checked_in' ? 'text-lime-400' : h.status === 'no_show' ? 'text-red-300' : 'text-gray-400'}`}>
                    {t(`player.status_${h.status}`)}
                    {h.late_cancel && h.refund_percent == null && ` · ${t('policy.lateBadge')}`}
                  </span>
                  {h.can_cancel && (
                    <button className="text-red-400 text-xs" onClick={() => cancelEvent(h)}>{t('events.cancel')}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-center mt-6">
        <Link href="/home" className="text-gray-500 text-xs underline">← {t('hub.navHome')}</Link>
      </p>

      <Modal open={!!qr} title={t('join.payTitle')} onClose={() => setQr(null)}>
        {qr && <PaymentCard payment={qr} />}
      </Modal>
    </PlayerShell>
  );
}
