'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import DatePopover from '@/components/DatePopover';
import TeamLeagueSetup from '@/components/TeamLeagueSetup';
import Section from '@/components/NumberedSection';
import { todayYmd } from '@/lib/dates';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';


export default function NewTournamentPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { club } = useDefaultClub();
  const { data: members } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/members`) : Promise.resolve([])), [club?.id]);
  const [kind, setKind] = useState('pairs');
  const [info, setInfo] = useState({ name: '', event_date: todayYmd(), start_time: '08:00', end_time: '', location: '', entry_fee: '' });
  // ?from=<id>: "edit" an existing tournament = rebuild it with its settings pre-filled.
  const [from, setFrom] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [loadingFrom, setLoadingFrom] = useState(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('from');
    if (!id) return;
    setLoadingFrom(true);
    api
      .get(`/api/tournaments/${id}`)
      .then((tr) => {
        setFrom(tr);
        setKind(tr.kind === 'team' ? 'team' : 'pairs');
        setInfo({
          name: tr.name,
          event_date: tr.event_date || todayYmd(),
          start_time: tr.start_time ? tr.start_time.slice(0, 5) : '',
          end_time: tr.end_time ? tr.end_time.slice(0, 5) : '',
          location: tr.location || '',
          entry_fee: tr.entry_fee ? String(Number(tr.entry_fee)) : '',
        });
        setPrefill(
          tr.kind === 'team'
            ? { formats: tr.sub_formats, winRule: tr.win_rule, teams: tr.teams.map((tm) => ({ name: tm.name, ids: tm.players.map((p) => p.id) })) }
            : {
                teams: tr.teams.map((tm) => [tm.player1_id, tm.player2_id].filter(Boolean)),
                mode: tr.group_count > 0 ? 'groups' : 'ko',
                groupCount: tr.group_count || 2,
                advance: tr.advance_per_group || 2,
              }
        );
      })
      .catch(() => {})
      .finally(() => setLoadingFrom(false));
  }, []);
  const setI = (patch) => setInfo((x) => ({ ...x, ...patch }));
  const base = {
    club_id: club?.id,
    name: info.name.trim(),
    event_date: info.event_date || null,
    start_time: info.start_time || null,
    end_time: info.end_time || null,
    location: info.location.trim() || null,
    entry_fee: Number(info.entry_fee || 0),
  };
  const timeError = info.start_time && info.end_time && info.end_time <= info.start_time ? t('create.endAfterStart') : '';
  const ready = !!club && !!base.name && !timeError;
  // Players already in the tournament being edited stay selectable even if inactive now.
  const inTournament = new Set(prefill ? prefill.teams.flatMap((tm) => (Array.isArray(tm) ? tm : tm.ids)) : []);
  const active = (members || []).filter((m) => m.is_active || inTournament.has(m.id));
  // Rebuilt from an existing tournament: the old one is replaced.
  const done = async (created) => {
    if (from) {
      // Keep who already paid the entry fee, then retire the old version.
      await api.post(`/api/tournaments/${created.id}/fees/import`, { from: from.id }).catch(() => {});
      await api.del(`/api/tournaments/${from.id}`).catch(() => {});
    }
    router.push(`/club/tournaments/${created.id}`);
  };

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-white text-2xl font-bold">{from ? t('tournaments.editTitle') : t('nav.createTournament')}</h1>
        <Link href={from ? `/club/tournaments/${from.id}` : '/club/tournaments'} className="text-gray-400 text-sm hover:text-white shrink-0">
          {from ? `← ${from.name}` : `${t('tournaments.allList')} →`}
        </Link>
      </div>
      {from && <p className="card !py-3 mb-4 border-yellow-400/50 text-yellow-200 text-sm">✏️ {t('tournaments.editHint')}</p>}
      {loadingFrom && <p className="text-gray-400 text-sm mb-4">{t('common.loading')}</p>}

      <Section n={1} title={t('tournaments.kindTitle')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {['pairs', 'team'].map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-xl border p-3 text-left transition ${kind === k ? 'border-lime-400 bg-lime-400/10' : 'border-navy-600 hover:border-navy-500'}`}
            >
              <div className="text-white font-semibold">{k === 'pairs' ? '🏓' : '👥'} {t(`tournaments.kind_${k}`)}</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2 md:col-span-4">
            <label className="text-xs text-gray-400">{t('tournaments.name')}</label>
            <input className="input" maxLength={120} placeholder={t(kind === 'team' ? 'tournaments.namePhTeam' : 'tournaments.namePh')} value={info.name} onChange={(e) => setI({ name: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-400">{t('events.date')}</label>
            <DatePopover value={info.event_date} onChange={(d) => setI({ event_date: d })} />
          </div>
          <div>
            <label className="text-xs text-gray-400">{t('create.start')}</label>
            <input className="input" type="time" value={info.start_time} onChange={(e) => setI({ start_time: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-400">{t('create.end')}</label>
            <input className="input" type="time" value={info.end_time} onChange={(e) => setI({ end_time: e.target.value })} />
          </div>
          <div className="col-span-2 md:col-span-4">
            <label className="text-xs text-gray-400">{t('events.location')}</label>
            <input className="input" placeholder={t('create.locationPh')} value={info.location} onChange={(e) => setI({ location: e.target.value })} />
          </div>
          <div className="col-span-2 md:col-span-4 rounded-lg border border-lime-400/30 bg-lime-400/5 p-3 grid grid-cols-1 sm:grid-cols-[14rem_1fr] gap-x-4 gap-y-1 items-center">
            <div className="min-w-0">
              <label className="text-xs text-lime-300 font-semibold">💰 {t('tournaments.entryFee')}</label>
              <input className="input" type="number" inputMode="numeric" min="0" step="10000" placeholder="0" value={info.entry_fee} onChange={(e) => setI({ entry_fee: e.target.value })} />
            </div>
            <p className="text-gray-400 text-xs">{t('tournaments.entryFeeHint')}</p>
          </div>
        </div>
        {timeError && <p className="text-red-400 text-xs mt-2">{timeError}</p>}
      </Section>

      {!loadingFrom &&
        (kind === 'pairs' ? (
          <PairsSetup key={`p${from?.id || ''}`} club={club} active={active} base={base} ready={ready} onCreated={done} initial={from?.kind !== 'team' ? prefill : null} />
        ) : (
          <TeamLeagueSetup key={`t${from?.id || ''}`} club={club} active={active} base={base} ready={ready} onCreated={done} initial={from?.kind === 'team' ? prefill : null} />
        ))}
    </AppShell>
  );
}

// Doubles: pairs of any genders (a club tournament is always doubles); groups → knockout.
const format = 'doubles';
const size = 2;
function PairsSetup({ club, active, base, ready, onCreated, initial }) {
  const { t } = useI18n();
  const [picked, setPicked] = useState(() => (initial ? initial.teams.flat() : []));
  const [teams, setTeams] = useState(() => (initial ? initial.teams.map((tm) => [tm[0] || '', tm[1] || '']) : [])); // [[id, id], ...]
  const [leftover, setLeftover] = useState([]);
  const [mode, setMode] = useState(initial?.mode || 'groups');
  const [groupCount, setGroupCount] = useState(initial?.groupCount || 2);
  const [advance, setAdvance] = useState(initial?.advance || 2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const byId = useMemo(() => new Map(active.map((m) => [m.id, m])), [active]);
  const complete = teams.filter((tm) => tm.length === size && tm.every(Boolean));
  const incomplete = teams.length - complete.length;
  const inTeams = new Set(teams.flat().filter(Boolean));
  const unpaired = picked.filter((id) => !inTeams.has(id)).map((id) => byId.get(id)?.full_name).filter(Boolean);

  function togglePlayer(id) {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    setTeams((ts) => ts.map((tm) => tm.map((x) => (next.includes(x) ? x : ''))));
  }

  async function autoPair(pairMode) {
    setError('');
    try {
      const res = await api.post('/api/tournaments/pairing', { club_id: club.id, format, mode: pairMode, player_ids: picked });
      setTeams(res.teams.map((tm) => tm.players.map((p) => p.id)));
      setLeftover(res.leftover.map((p) => p.full_name));
    } catch (err) {
      setError(err.message);
    }
  }

  function setSlot(ti, pi, id) {
    setTeams((ts) => ts.map((tm, i) => (i === ti ? tm.map((x, j) => (j === pi ? id : x)) : tm)));
  }

  const groups = mode === 'groups' ? Math.max(1, Math.min(groupCount, Math.floor(complete.length / 2) || 1)) : 0;
  const perGroup = groups ? Math.floor(complete.length / groups) : 0;
  const groupMatches = groups
    ? Array.from({ length: groups }, (_, g) => {
        const n = Math.floor(complete.length / groups) + (g < complete.length % groups ? 1 : 0);
        return (n * (n - 1)) / 2;
      }).reduce((a, b) => a + b, 0)
    : 0;

  async function create() {
    setBusy(true);
    setError('');
    try {
      const created = await api.post('/api/tournaments', {
        ...base,
        kind: 'pairs',
        format,
        division: 'open',
        group_count: groups,
        advance_per_group: Math.min(advance, perGroup || advance),
        teams: complete.map((tm) => ({ player_ids: tm })),
      });
      onCreated(created);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const label = (m) => `${m.full_name}${m.gender ? ` (${t(`members.${m.gender}`)})` : ''}${m.dupr_level != null ? ` · ${m.dupr_level}` : ''}`;

  return (
    <>
      <Section n={2} title={t('tournaments.players', { n: picked.length })}>
        <button type="button" className="text-lime-400 text-sm mb-2" onClick={() => setPicked(active.map((m) => m.id))}>
          {t('tournaments.selectAll')}
        </button>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 max-h-72 overflow-y-auto">
          {active.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm text-gray-200 py-1">
              <input type="checkbox" checked={picked.includes(m.id)} onChange={() => togglePlayer(m.id)} />
              <span className="truncate">{label(m)}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section n={3} title={t('tournaments.teams', { n: complete.length })}>
          <div className="flex flex-wrap gap-2 mb-2">
            <button type="button" className="btn-primary text-sm" disabled={picked.length < 2} onClick={() => autoPair('balanced')}>{t('tournaments.pairBalanced')}</button>
            <button type="button" className="btn-secondary text-sm" disabled={picked.length < 2} onClick={() => autoPair('random')}>{t('tournaments.pairRandom')}</button>
          </div>
          <p className="text-gray-500 text-xs mb-3">{t('tournaments.pairHint')}</p>
          {leftover.length > 0 && <p className="text-yellow-400 text-xs mb-2">{t('tournaments.leftover', { names: leftover.join(', ') })}</p>}
          <div className="flex flex-col gap-2">
            {teams.map((tm, ti) => (
              <div key={ti} className="flex items-center gap-2">
                <span className="text-gray-500 text-xs w-6">{ti + 1}.</span>
                {tm.map((id, pi) => (
                  <select key={pi} className="input text-sm" value={id} onChange={(e) => setSlot(ti, pi, e.target.value)}>
                    <option value="">{t('tournaments.pick')}</option>
                    {picked.map((pid) => byId.get(pid)).filter(Boolean).map((m) => (
                      <option key={m.id} value={m.id} disabled={inTeams.has(m.id) && m.id !== id}>{label(m)}</option>
                    ))}
                  </select>
                ))}
                <button type="button" className="text-red-400 text-xs px-1" onClick={() => setTeams((ts) => ts.filter((_, i) => i !== ti))}>
                  {t('tournaments.remove')}
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="text-lime-400 text-sm mt-2" onClick={() => setTeams((ts) => [...ts, Array(size).fill('')])}>
            {t('tournaments.addTeam')}
          </button>
          {incomplete > 0 && <p className="text-red-400 text-sm mt-2">⚠️ {t('tournaments.incomplete', { n: incomplete })}</p>}
          {teams.length > 0 && unpaired.length > 0 && <p className="text-yellow-300 text-sm mt-1">{t('tournaments.unpaired', { names: unpaired.join(', ') })}</p>}
      </Section>

      <Section n={4} title={t('tournaments.structure')}>
        <div className="grid grid-cols-2 bg-navy-950 rounded-lg p-1 text-sm mb-3">
          {['groups', 'ko'].map((k) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-md py-1.5 ${mode === k ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-400'}`}>
              {k === 'groups' ? t('tournaments.groupsKo') : t('tournaments.koOnly')}
            </button>
          ))}
        </div>
        {mode === 'groups' && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-400">{t('tournaments.groupCount')}</label>
              <input className="input" type="number" min="1" max="16" value={groupCount} onChange={(e) => setGroupCount(Number(e.target.value) || 1)} />
            </div>
            <div>
              <label className="text-xs text-gray-400">{t('tournaments.advance')}</label>
              <input className="input" type="number" min="1" max="8" value={advance} onChange={(e) => setAdvance(Number(e.target.value) || 1)} />
            </div>
          </div>
        )}
        <p className="text-gray-300 text-sm">
          {mode === 'groups'
            ? t('tournaments.summary', { teams: complete.length, groups, matches: groupMatches, ko: groups * Math.min(advance, perGroup || advance) })
            : t('tournaments.summaryKo', { teams: complete.length })}
        </p>
      </Section>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {complete.length < 2 && <p className="text-gray-500 text-xs mb-2">{t('tournaments.needTeams')}</p>}
      {!base.name && <p className="text-gray-500 text-xs mb-2">{t('tournaments.needName')}</p>}
      <button className="btn-primary w-full sm:w-auto" disabled={busy || !ready || complete.length < 2 || incomplete > 0} onClick={create}>
        {t('tournaments.createBtn')}
      </button>
    </>
  );
}
