'use client';
import { useMemo, useState } from 'react';
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

const TEAM_SIZE = { singles: 1, doubles: 2, mixed: 2 };
const DIVISIONS = ['open', 'men', 'women'];
const DIVISION_GENDER = { men: 'male', women: 'female' };

export default function NewTournamentPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { club } = useDefaultClub();
  const { data: members } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/members`) : Promise.resolve([])), [club?.id]);
  const [kind, setKind] = useState('pairs');
  const [info, setInfo] = useState({ name: '', event_date: todayYmd(), start_time: '08:00', end_time: '', location: '' });
  const setI = (patch) => setInfo((x) => ({ ...x, ...patch }));
  const base = {
    club_id: club?.id,
    name: info.name.trim(),
    event_date: info.event_date || null,
    start_time: info.start_time || null,
    end_time: info.end_time || null,
    location: info.location.trim() || null,
  };
  const timeError = info.start_time && info.end_time && info.end_time <= info.start_time ? t('create.endAfterStart') : '';
  const ready = !!club && !!base.name && !timeError;
  const active = (members || []).filter((m) => m.is_active);
  const done = (created) => router.push(`/club/tournaments/${created.id}`);

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-white text-2xl font-bold">{t('nav.createTournament')}</h1>
        <Link href="/club/tournaments" className="text-gray-400 text-sm hover:text-white shrink-0">{t('tournaments.allList')} →</Link>
      </div>

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
              <p className="text-gray-400 text-xs mt-1">{t(`tournaments.kind_${k}Desc`)}</p>
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
        </div>
        {timeError && <p className="text-red-400 text-xs mt-2">{timeError}</p>}
      </Section>

      {kind === 'pairs' ? (
        <PairsSetup club={club} active={active} base={base} ready={ready} onCreated={done} />
      ) : (
        <TeamLeagueSetup club={club} active={active} base={base} ready={ready} onCreated={done} />
      )}
    </AppShell>
  );
}

// Individual / pairs: singles, men's/women's/open doubles or mixed; groups → knockout.
function PairsSetup({ club, active: allActive, base, ready, onCreated }) {
  const { t } = useI18n();
  const [format, setFormat] = useState('doubles');
  const [division, setDivision] = useState('open');
  const [picked, setPicked] = useState([]);
  const [teams, setTeams] = useState([]); // [[id, id], ...]
  const [leftover, setLeftover] = useState([]);
  const [mode, setMode] = useState('groups');
  const [groupCount, setGroupCount] = useState(2);
  const [advance, setAdvance] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // A men's / women's event only lists players of that gender.
  const want = format === 'mixed' ? null : DIVISION_GENDER[division];
  const active = want ? allActive.filter((m) => m.gender === want) : allActive;
  const byId = useMemo(() => new Map(active.map((m) => [m.id, m])), [active]);
  const size = TEAM_SIZE[format];
  const complete = teams.filter((tm) => tm.length === size && tm.every(Boolean));
  const inTeams = new Set(teams.flat().filter(Boolean));

  function changeFormat(f, div = division) {
    const g = f === 'mixed' ? null : DIVISION_GENDER[div];
    const keep = g ? picked.filter((id) => allActive.find((m) => m.id === id)?.gender === g) : picked;
    setFormat(f);
    setDivision(div);
    setPicked(keep);
    setTeams(f === 'singles' ? keep.map((id) => [id]) : []);
    setLeftover([]);
  }

  function togglePlayer(id) {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    if (format === 'singles') setTeams(next.map((x) => [x]));
    else setTeams((ts) => ts.map((tm) => tm.map((x) => (next.includes(x) ? x : ''))));
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
        division: format === 'mixed' ? 'open' : division,
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
      <Section n={2} title={t('tournaments.format')}>
        <div className="grid grid-cols-3 bg-navy-950 rounded-lg p-1 text-sm">
          {Object.keys(TEAM_SIZE).map((f) => (
            <button key={f} type="button" onClick={() => changeFormat(f)} className={`rounded-md py-1.5 ${format === f ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-400'}`}>
              {t(`matches.${f}`)}
            </button>
          ))}
        </div>
        {format === 'mixed' ? (
          <p className="text-gray-500 text-xs mt-2">{t('matches.mixedHint')}</p>
        ) : (
          <>
            <label className="text-xs text-gray-400 block mt-3 mb-1">{t('tournaments.division')}</label>
            <div className="grid grid-cols-3 bg-navy-950 rounded-lg p-1 text-sm">
              {DIVISIONS.map((d) => (
                <button key={d} type="button" onClick={() => changeFormat(format, d)} className={`rounded-md py-1.5 ${division === d ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-400'}`}>
                  {t(`tournaments.div_${d}${format === 'singles' ? 'S' : ''}`)}
                </button>
              ))}
            </div>
            {want && <p className="text-gray-500 text-xs mt-2">{t('tournaments.divHint')}</p>}
          </>
        )}
      </Section>

      <Section n={3} title={t('tournaments.players', { n: picked.length })}>
        <button type="button" className="text-lime-400 text-sm mb-2" onClick={() => {
          const all = active.map((m) => m.id);
          setPicked(all);
          if (format === 'singles') setTeams(all.map((x) => [x]));
        }}>
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

      {format !== 'singles' && (
        <Section n={4} title={t('tournaments.teams', { n: complete.length })}>
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
        </Section>
      )}

      <Section n={format === 'singles' ? 4 : 5} title={t('tournaments.structure')}>
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
      <button className="btn-primary w-full sm:w-auto" disabled={busy || !ready || complete.length < 2} onClick={create}>
        {t('tournaments.createBtn')}
      </button>
    </>
  );
}
