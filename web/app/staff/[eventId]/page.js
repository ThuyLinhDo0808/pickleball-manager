'use client';
import { levelTag } from '@/lib/levels';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import MatchForm from '@/components/MatchForm';
import MatchList from '@/components/MatchList';
import QrCheckinPanel from '@/components/QrCheckinPanel';
import CourtRotation from '@/components/CourtRotation';
import SessionStandings, { standings } from '@/components/SessionStandings';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import Segmented from '@/components/ui/Segmented';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';

const STATUS_ORDER = { registered: 0, pending: 1, checked_in: 2, no_show: 3, waitlisted: 4 };
const FILTERS = ['todo', 'here', 'absent', 'all'];

// What a referee / coordinator sees for one event — never money or phone numbers.
// Coordinator: check-in (search, QR, walk-ins, the waitlist), courts (rounds + scores),
// scores, the session board. Referee: scores and the session board.
export default function StaffEventPage() {
  const { eventId } = useParams();
  const { t, lang, sport } = useI18n();
  const base = `/api/staff/events/${eventId}`;
  const { data: ev, loading, reload, setData } = useLoad(() => api.get(base), [eventId]);
  const [tab, setTab] = useState(null);
  const [filter, setFilter] = useState('todo');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [flash, setFlash] = useState('');
  const [showMatch, setShowMatch] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [walkIn, setWalkIn] = useState('');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab');
    if (q) setTab(q);
  }, []);

  if (loading && !ev) return <AppShell><p className="text-gray-400">{t('common.loading')}</p></AppShell>;
  if (!ev) return <AppShell><p className="text-gray-400">{t('staffView.none')}</p></AppShell>;

  const tabs = [...(ev.can.checkIn ? ['checkin'] : []), ...(ev.can.courts ? ['courts'] : []), 'scores', 'board'];
  const current = tabs.includes(tab) ? tab : tabs[0];
  const mainList = ev.participants.filter((p) => p.status !== 'waitlisted');
  const arrived = mainList.filter((p) => p.status === 'checked_in');
  const absent = mainList.filter((p) => p.status === 'no_show');
  const waiting = ev.participants.filter((p) => p.status === 'waitlisted');
  const todo = mainList.filter((p) => p.status === 'registered' || p.status === 'pending');
  const q = query.trim().toLowerCase();
  const people = ev.participants
    .filter((p) => !q || p.full_name.toLowerCase().includes(q))
    .filter((p) => q || filter === 'all' || (filter === 'todo' ? ['registered', 'pending', 'waitlisted'].includes(p.status) : filter === 'here' ? p.status === 'checked_in' : p.status === 'no_show'))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.full_name.localeCompare(b.full_name, 'vi'));

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
      } else if (action === 'promote') {
        setFlash(t('staffX.promoted', { name: p.full_name }));
      }
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function addWalkIn(e) {
    e.preventDefault();
    try {
      const p = await api.post(`${base}/participants`, { full_name: walkIn });
      setData({ ...ev, participants: [...ev.participants, p] });
      setFlash(p.waitlisted ? t('staffX.walkInWaitlist', { name: p.full_name }) : t('staffX.walkInDone', { name: p.full_name }));
      setWalkIn('');
    } catch (err) {
      window.alert(err.message);
    }
  }

  const time = [hhmm(ev.start_time), hhmm(ev.end_time)].filter(Boolean).join('–');
  const TAB_LABEL = {
    checkin: `✅ ${t('staffView.checkInTab')}`,
    courts: `🏟 ${t('staffX.courtsTab')}`,
    scores: `🎾 ${t('staffView.scoresTab')} (${ev.matches.length})`,
    board: `📊 ${t('staffX.boardTab')}`,
  };
  const isCoord = ev.role === 'coordinator';
  const leader = isCoord ? null : standings(ev.participants, ev.matches)[0];
  const lastMatch = ev.matches[0]?.played_at ? new Date(ev.matches[0].played_at) : null;

  return (
    <AppShell>
      <Link href="/staff" className="text-gray-400 text-sm hover:text-white">{t('staffView.back')}</Link>
      <div className="relative overflow-hidden rounded-2xl border border-navy-700 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-4 sm:p-5 mt-2 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-white text-2xl font-bold truncate">{ev.title}</h1>
            <p className="text-lime-300 text-sm capitalize">
              {formatDay(ev.event_date, lang, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
              {time && ` · ${time}`}
            </p>
            <p className="text-gray-400 text-sm">📍 {ev.location || '—'}{ev.club_name ? ` · ${ev.club_name}` : ''}{ev.courts ? ` · ${t('createx.courtsN', { n: ev.courts })}` : ''}</p>
          </div>
          <span className={`text-xs font-semibold rounded-full border px-2.5 py-1 shrink-0 ${ev.role === 'coordinator' ? 'border-lime-400/40 bg-lime-400/15 text-lime-300' : 'border-sky-400/40 bg-sky-400/15 text-sky-300'}`}>
            {ev.role === 'coordinator' ? '🦺' : '🏁'} {t(`staff.${ev.role}`)}
          </span>
        </div>
      </div>

      {isCoord ? (
        <KpiRow cols={4}>
          <StatTile icon="✅" label={t('staffX.kpiArrived')} value={`${arrived.length}/${mainList.length}`} tone="text-lime-300" sub={t('staffX.kpiArrivedSub', { n: todo.length })} />
          <StatTile icon="🚫" label={t('staffX.kpiAbsent')} value={absent.length} tone={absent.length ? 'text-yellow-300' : 'text-white'} />
          <StatTile icon="⏳" label={t('staffX.kpiWaitlist')} value={waiting.length} tone="text-sky-300" />
          <StatTile icon="🎾" label={t('staffX.kpiMatches')} value={ev.matches.length} />
        </KpiRow>
      ) : (
        // Referee: the match side of the session.
        <KpiRow cols={4}>
          <StatTile icon="🎾" label={t('staffX.kpiMatches')} value={ev.matches.length} tone="text-lime-300" />
          <StatTile icon="👥" label={t('staffX.kpiPlayersHere')} value={`${arrived.length}/${mainList.length}`} tone="text-sky-300" />
          <StatTile icon="🏆" label={t('staffX.kpiLeader')} value={leader ? <span className="block truncate text-base sm:text-lg">{leader.name}</span> : '—'} sub={leader ? t('staffX.kpiLeaderSub', { won: leader.won, played: leader.played }) : null} />
          <StatTile icon="⏱" label={t('staffX.kpiLastMatch')} value={lastMatch ? lastMatch.toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'} />
        </KpiRow>
      )}

      <div role="tablist" className="grid gap-1 bg-navy-900 border border-navy-700 rounded-xl p-1 mb-4" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((k) => (
          <button key={k} role="tab" aria-selected={current === k} onClick={() => setTab(k)} className={`rounded-lg py-2 text-sm truncate ${current === k ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-300 hover:bg-navy-800'}`}>
            {TAB_LABEL[k]}
          </button>
        ))}
      </div>
      {!ev.can.checkIn && <p className="text-gray-500 text-xs mb-3">{t('staffView.refereeOnly')}</p>}

      {flash && (
        <div className="card mb-3 border-lime-400/50 text-lime-300 text-sm flex items-center justify-between gap-3">
          <span>{flash}</span>
          <button className="text-gray-400 text-lg leading-none" aria-label="Close" onClick={() => setFlash('')}>×</button>
        </div>
      )}

      {current === 'checkin' && ev.can.checkIn && (
        <>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input className="input flex-1" type="search" placeholder={t('staffView.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="btn-primary shrink-0 text-sm" onClick={() => setShowQr(true)}>📷 {t('qr.scan')}</button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Segmented
              items={FILTERS}
              value={filter}
              onChange={setFilter}
              label={(k) => `${t(`staffX.f_${k}`)} (${{ todo: todo.length + waiting.length, here: arrived.length, absent: absent.length, all: ev.participants.length }[k]})`}
            />
          </div>
          <Modal open={showQr} title={t('qr.scanTitle')} onClose={() => setShowQr(false)}>
            {showQr && <QrCheckinPanel endpoint={`${base}/checkin-code`} onCheckedIn={reload} />}
          </Modal>
          <div className="card !p-0 divide-y divide-navy-700 mb-4">
            {people.length === 0 && <p className="text-gray-500 text-sm px-4 py-3">{t('staffX.nobodyHere')}</p>}
            {people.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className={`truncate ${p.status === 'waitlisted' ? 'text-gray-400' : 'text-white'}`}>{p.full_name}</div>
                  <div className="text-gray-500 text-xs">
                    {p.status === 'waitlisted' ? `⏳ ${t('events.waitlist')}` : p.status === 'pending' ? t('signup.pendingShort') : p.dupr_level != null ? levelTag(p.dupr_level, ev?.sport || sport, t) : ''}
                  </div>
                </div>
                {p.status === 'waitlisted' ? (
                  ev.can.promote && (
                    <button className="btn-secondary text-sm" disabled={busyId === p.id} onClick={() => act(p, 'promote')}>⬆ {t('staffX.promote')}</button>
                  )
                ) : p.status === 'checked_in' || p.status === 'no_show' ? (
                  <>
                    <span className={`text-sm font-semibold ${p.status === 'checked_in' ? 'text-lime-400' : 'text-yellow-400'}`}>
                      {p.status === 'checked_in' ? t('staffView.here') : t('staffView.absent')}
                    </span>
                    <button className="text-gray-400 text-xs underline" disabled={busyId === p.id} onClick={() => act(p, 'reset')}>{t('staffView.undo')}</button>
                  </>
                ) : (
                  <>
                    <button className="text-yellow-400 text-sm px-2" disabled={busyId === p.id} onClick={() => act(p, 'no-show')}>{t('staffView.absent')}</button>
                    <button className="btn-primary text-sm" disabled={busyId === p.id} onClick={() => act(p, 'check-in')}>{t('staffView.checkIn')}</button>
                  </>
                )}
              </div>
            ))}
          </div>
          {ev.can.walkIn && (
            <form onSubmit={addWalkIn} className="card flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1">
                <label className="text-xs text-gray-400">➕ {t('staffX.walkIn')}</label>
                <input className="input" required maxLength={120} placeholder={t('staffX.walkInPh')} value={walkIn} onChange={(e) => setWalkIn(e.target.value)} />
                <p className="text-gray-500 text-xs mt-1">{t('staffX.walkInHint')}</p>
              </div>
              <button className="btn-primary shrink-0">{t('staffX.walkInBtn')}</button>
            </form>
          )}
        </>
      )}

      {current === 'courts' && ev.can.courts && (
        <CourtRotation players={arrived} matches={ev.matches} defaultCourts={ev.courts} endpoint={`${base}/matches`} sport={ev.sport} onSaved={reload} />
      )}

      {current === 'board' && <SessionStandings participants={ev.participants} matches={ev.matches} />}

      {current === 'scores' && (
        <>
          <div className="flex justify-end mb-3">
            <button className="btn-primary text-sm" onClick={() => setShowMatch(true)}>+ {t('matches.add')}</button>
          </div>
          <MatchList matches={ev.matches} onChanged={reload} basePath={`${base}/matches`} allowDelete={false} sport={ev.sport} />
          <Modal open={showMatch} title={t('matches.add')} onClose={() => setShowMatch(false)}>
            {showMatch && (
              <MatchForm
                sport={ev?.sport}
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
