'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import Hint from '@/components/ui/Hint';
import MapLink from '@/components/MapLink';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import EmptyState from '@/components/ui/EmptyState';
import QrScanner from '@/components/QrScanner';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';
import { formatVnd } from '@/lib/format';
import { CoachGate } from '@/components/coach/CoachGate';
import { endTime } from '@/lib/coach';
import { SessionRow } from '@/components/coach/SessionRow';
import { StudentLine } from '@/components/coach/StudentRow';
import { BalanceChip } from '@/components/coach/Balance';

const MARKS = ['present', 'absent', 'excused'];
const MARK_TONE = {
  present: 'bg-lime-400 text-navy-950',
  absent: 'bg-red-400/80 text-navy-950',
  excused: 'bg-sky-400/80 text-navy-950',
};
const SCAN_TONE = { ok: 'border-lime-400/60 text-lime-300', again: 'border-sky-400/60 text-sky-300', bad: 'border-red-400/60 text-red-300' };

// One session: when and where (move / cancel), then attendance: one row per confirmed
// student with Có mặt / Vắng / Báo nghỉ, the package balance or the per-session fee,
// a QR scanner for the players' own codes, and "Hoàn tất buổi" that marks the rest absent.
export default function CoachSessionPage() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { data: s, loading, error, reload } = useLoad(() => api.get(`/api/coach/sessions/${id}`), [id]);
  const { data: ppl, error: pErr, reload: reloadPeople } = useLoad(() => api.get(`/api/coach/sessions/${id}/people`), [id]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [log, setLog] = useState([]);
  const refresh = () => { reload(); reloadPeople(); };
  const rows = ppl?.rows || [];
  const done = s?.status === 'done';
  const cancelled = s?.status === 'cancelled';

  async function mark(r, status) {
    setBusy(true);
    try {
      await api.post(`/api/coach/sessions/${id}/attendance`, { student_id: r.student.id, status: r.attendance?.status === status ? null : status });
      reloadPeople();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function fee(r, status) {
    setBusy(true);
    try {
      await api.patch(`/api/coach/fees/${r.fee.id}`, { status });
      reloadPeople();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    const unmarked = rows.filter((r) => !r.attendance && !r.left).length;
    if (!window.confirm(t('coach.finishAsk', { n: unmarked }))) return;
    setBusy(true);
    try {
      await api.post(`/api/coach/sessions/${id}/finish`, {});
      refresh();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function scanned(code) {
    setBusy(true);
    let entry;
    try {
      const r = await api.post(`/api/coach/sessions/${id}/scan`, { code });
      entry = r.already
        ? { tone: 'again', text: t('qr.already', { name: r.full_name }) }
        : { tone: 'ok', text: `${t('qr.done', { name: r.full_name })}${r.balance?.has_package ? ` · ${t('coach.balLeft', { n: r.balance.remaining })}` : ''}` };
      if (!r.already) reloadPeople();
    } catch (err) {
      entry = { tone: 'bad', text: err.message };
    }
    setLog((l) => [{ ...entry, at: new Date().toLocaleTimeString().slice(0, 5), id: Math.random() }, ...l].slice(0, 6));
    setTimeout(() => setBusy(false), 1200);
  }
  const tally = { present: 0, absent: 0, excused: 0 };
  for (const r of rows) if (r.attendance) tally[r.attendance.status] += 1;

  return (
    <AppShell>
      <CoachGate error={error} reload={reload}>
        {loading && !s && <LoadingBlock rows={3} className="card mt-3" />}
        {error && <ErrorBlock message={error.message} onRetry={reload} />}
        {s && (
          <>
            <PageHeader
              icon="schedule"
              title={<span className="capitalize">{formatDay(s.session_date, lang, { weekday: 'long', day: '2-digit', month: '2-digit' })}</span>}
              subtitle={`${hhmm(s.start_time)}–${endTime(s.start_time, s.duration_min)} · ${s.class?.title || ''}${cancelled ? ` · ${t('coach.sstatus_cancelled')}` : done ? ` · ${t('coach.sstatus_done')}` : ''}`}
              hint={<Hint inline text={t('coach.attHint')} />}
              actions={
                !cancelled && !done && rows.length > 0 ? (
                  <button type="button" className="btn-primary" disabled={busy} onClick={finish}>{t('coach.finish')}</button>
                ) : null
              }
            />
            <section className="card !p-0 overflow-hidden mb-4">
              <SessionRow s={{ ...s, class_title: s.class?.title }} lang={lang} onChanged={refresh} />
              {(s.court_name || s.class?.map_url) && (
                <p className="px-4 py-2 text-sm text-gray-300 border-t border-navy-700">
                  {s.court_name || '—'}
                  {s.class?.map_url && <span className="ml-2"><MapLink location={s.court_name} mapUrl={s.class.map_url} showHint={false} /></span>}
                </p>
              )}
              {s.note && <p className="px-4 py-2 text-sm text-gray-400 border-t border-navy-700 whitespace-pre-line">{s.note}</p>}
            </section>

            <section className="card !p-0 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-navy-700">
                <h2 className="text-white font-semibold">{t('coach.sPeople')} <span className="text-gray-500 font-normal text-sm">({rows.length})</span></h2>
                <span className="text-xs text-gray-400 tabular-nums">
                  {t('coach.att_present')} {tally.present} · {t('coach.att_absent')} {tally.absent} · {t('coach.att_excused')} {tally.excused}
                </span>
                {ppl?.deduct_mode && <span className="text-[11px] text-gray-500">{t(`coach.deductShort_${ppl.deduct_mode}`)}</span>}
                {!cancelled && (
                  <button type="button" className={`ml-auto btn-secondary text-sm ${scanning ? '!border-lime-400 text-lime-300' : ''}`} onClick={() => setScanning((v) => !v)}>
                    {scanning ? t('coach.scanStop') : t('coach.scan')}
                  </button>
                )}
              </div>
              {scanning && (
                <div className="px-4 py-3 border-b border-navy-700">
                  <QrScanner onScan={scanned} paused={busy} />
                  <Hint text={t('coach.scanHint')} className="mt-2" />
                  <ul className="mt-2 space-y-1.5">
                    {log.map((l) => (
                      <li key={l.id} className={`rounded-lg border px-3 py-2 text-sm ${SCAN_TONE[l.tone]}`}><span className="text-gray-500 text-xs mr-2 tabular-nums">{l.at}</span>{l.text}</li>
                    ))}
                  </ul>
                </div>
              )}
              {pErr && <p className="px-4 py-3 text-sm text-red-300">{pErr.message}</p>}
              {ppl && rows.length === 0 && (
                <div className="p-4"><EmptyState title={t('coach.attEmpty')}>{t('coach.attEmptyHint')}</EmptyState></div>
              )}
              {rows.map((r) => {
                const a = r.attendance;
                const noPackage = r.pay_mode === 'package' && !r.balance?.has_package && !(a?.purchase_id);
                return (
                  <div key={r.student.id} className={`px-4 py-2.5 border-b border-navy-700 last:border-b-0 ${r.left ? 'opacity-60' : ''}`}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="flex-1 min-w-[11rem]">
                        <StudentLine
                          s={r.student}
                          sub={[r.pay_mode ? t(`coach.pay_${r.pay_mode}`) : t('coach.attLeft'), a?.by_student ? t(a.late ? 'coach.attLateNotice' : 'coach.attNotice') : null].filter(Boolean).join(' · ')}
                        />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.pay_mode === 'package' && <BalanceChip b={r.balance} charged={!!a?.purchase_id} noPackage={noPackage && !!a && a.status !== 'excused'} />}
                        {r.fee && (
                          <button type="button" disabled={busy} onClick={() => fee(r, r.fee.status === 'paid' ? 'unpaid' : 'paid')} className={`text-[11px] rounded-full px-2 py-1 min-h-[32px] tabular-nums ${r.fee.status === 'paid' ? 'bg-lime-400/15 text-lime-300' : r.fee.status === 'free' ? 'bg-navy-700 text-gray-300' : 'bg-amber-300/15 text-amber-200'}`} title={t('coach.feeToggle')}>
                            {formatVnd(r.fee.amount)} · {t(`coach.fee_${r.fee.status}`)}
                          </button>
                        )}
                        {!cancelled && (
                          <span className="inline-flex rounded-lg overflow-hidden border border-navy-600">
                            {MARKS.map((m) => (
                              <button
                                key={m}
                                type="button"
                                disabled={busy}
                                aria-pressed={a?.status === m}
                                onClick={() => mark(r, m)}
                                className={`px-3 min-h-[44px] text-xs font-semibold ${a?.status === m ? MARK_TONE[m] : 'bg-navy-800 text-gray-300 hover:text-white'}`}
                              >
                                {t(`coach.att_${m}`)}
                              </button>
                            ))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          </>
        )}
      </CoachGate>
    </AppShell>
  );
}
