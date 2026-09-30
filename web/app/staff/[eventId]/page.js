'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import MatchForm from '@/components/MatchForm';
import MatchList from '@/components/MatchList';
import QrCheckinPanel from '@/components/QrCheckinPanel';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const STATUS_ORDER = { registered: 0, checked_in: 1, no_show: 2, waitlisted: 3 };

// What a referee / coordinator sees for one event: check-in and scores. No money, no phones.
export default function StaffEventPage() {
  const { eventId } = useParams();
  const { t } = useI18n();
  const base = `/api/staff/events/${eventId}`;
  const { data: ev, loading, reload, setData } = useLoad(() => api.get(base), [eventId]);
  const [tab, setTab] = useState(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [flash, setFlash] = useState('');
  const [showMatch, setShowMatch] = useState(false);
  const [showQr, setShowQr] = useState(false);

  if (loading && !ev) return <AppShell><p className="text-gray-400">{t('common.loading')}</p></AppShell>;
  if (!ev) return <AppShell><p className="text-gray-400">{t('staffView.none')}</p></AppShell>;

  const current = tab || (ev.can.checkIn ? 'checkin' : 'scores');
  const people = ev.participants
    .filter((p) => p.full_name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.full_name.localeCompare(b.full_name));
  const mainList = ev.participants.filter((p) => p.status !== 'waitlisted');
  const arrived = mainList.filter((p) => p.status === 'checked_in').length;

  async function act(p, action) {
    setBusyId(p.id);
    try {
      const res = await api.post(`${base}/participants/${p.id}/${action}`, {});
      setData({ ...ev, participants: ev.participants.map((x) => (x.id === p.id ? { ...x, status: res.status } : x)) });
      const pass = res.pass;
      if (action === 'check-in' && pass) {
        setFlash(
          pass.unlimited
            ? t('events.passUnlimited', { name: p.full_name, period: pass.period_label })
            : t('events.passLeft', { name: p.full_name, period: pass.period_label, n: pass.sessions_remaining })
        );
      }
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <Link href="/staff" className="text-gray-400 text-sm">{t('staffView.back')}</Link>
      <div className="flex items-start justify-between gap-3 mt-2 mb-4">
        <div className="min-w-0">
          <h1 className="text-white text-2xl font-bold">{ev.title}</h1>
          <p className="text-gray-400 text-sm">
            {ev.event_date} {ev.start_time?.slice(0, 5) || ''} · {ev.location || '—'}
          </p>
        </div>
        <span className="text-xs rounded-full px-2 py-0.5 bg-navy-700 text-lime-300 shrink-0">{t(`staff.${ev.role}`)}</span>
      </div>

      <div className="grid grid-cols-2 bg-navy-900 rounded-lg p-1 text-sm mb-4">
        {['checkin', 'scores'].map((k) => (
          <button
            key={k}
            disabled={k === 'checkin' && !ev.can.checkIn}
            onClick={() => setTab(k)}
            className={`rounded-md py-2 disabled:opacity-30 ${current === k ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-400'}`}
          >
            {k === 'checkin' ? `${t('staffView.checkInTab')} · ${t('staffView.arrived', { n: arrived, total: mainList.length })}` : t('staffView.scoresTab')}
          </button>
        ))}
      </div>
      {!ev.can.checkIn && <p className="text-gray-500 text-xs mb-3">{t('staffView.refereeOnly')}</p>}

      {current === 'checkin' && ev.can.checkIn && (
        <>
          {flash && (
            <div className="card mb-3 border-lime-400/50 text-lime-300 text-sm flex items-center justify-between gap-3">
              <span>{flash}</span>
              <button className="text-gray-400 text-lg leading-none" aria-label="Close" onClick={() => setFlash('')}>×</button>
            </div>
          )}
          <div className="flex gap-2 mb-3">
            <input className="input" type="search" placeholder={t('staffView.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="btn-primary shrink-0 text-sm" onClick={() => setShowQr(true)}>📷 {t('qr.scan')}</button>
          </div>
          <Modal open={showQr} title={t('qr.scanTitle')} onClose={() => setShowQr(false)}>
            {showQr && <QrCheckinPanel endpoint={`${base}/checkin-code`} onCheckedIn={reload} />}
          </Modal>
          <div className="card !p-0 divide-y divide-navy-700">
            {people.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${p.status === 'waitlisted' ? 'opacity-60' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-white truncate">{p.full_name}</div>
                  <div className="text-gray-500 text-xs">
                    {p.status === 'waitlisted' ? t('events.waitlist') : p.dupr_level != null ? `DUPR ${p.dupr_level}` : ''}
                  </div>
                </div>
                {p.status === 'checked_in' || p.status === 'no_show' ? (
                  <>
                    <span className={`text-sm font-semibold ${p.status === 'checked_in' ? 'text-lime-400' : 'text-yellow-400'}`}>
                      {p.status === 'checked_in' ? t('staffView.here') : t('staffView.absent')}
                    </span>
                    <button className="text-gray-400 text-xs underline" disabled={busyId === p.id} onClick={() => act(p, 'reset')}>
                      {t('staffView.undo')}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="text-yellow-400 text-sm px-2" disabled={busyId === p.id} onClick={() => act(p, 'no-show')}>
                      {t('staffView.absent')}
                    </button>
                    <button className="btn-primary text-sm" disabled={busyId === p.id} onClick={() => act(p, 'check-in')}>
                      {t('staffView.checkIn')}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {current === 'scores' && (
        <>
          <div className="flex justify-end mb-3">
            <button className="btn-primary text-sm" onClick={() => setShowMatch(true)}>+ {t('matches.add')}</button>
          </div>
          <MatchList matches={ev.matches} onChanged={reload} basePath={`${base}/matches`} allowDelete={false} />
          <Modal open={showMatch} title={t('matches.add')} onClose={() => setShowMatch(false)}>
            {showMatch && (
              <MatchForm
                players={mainList.map((p) => ({ id: p.id, name: p.full_name }))}
                idField="event_participant_id"
                parent={{}}
                endpoint={`${base}/matches`}
                onCancel={() => setShowMatch(false)}
                onSaved={() => {
                  setShowMatch(false);
                  reload();
                }}
              />
            )}
          </Modal>
        </>
      )}
    </AppShell>
  );
}
