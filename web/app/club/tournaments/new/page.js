'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const TEAM_SIZE = { singles: 1, doubles: 2, mixed: 2 };

function Section({ n, title, children }) {
  return (
    <section className="card mb-4">
      <h2 className="text-white font-semibold mb-3">
        <span className="inline-flex w-6 h-6 rounded-full bg-lime-400 text-navy-950 text-xs font-bold items-center justify-center mr-2">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function NewTournamentPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { club } = useDefaultClub();
  const { data: members } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/members`) : Promise.resolve([])), [club?.id]);

  const [name, setName] = useState('');
  const [format, setFormat] = useState('doubles');
  const [picked, setPicked] = useState([]);
  const [teams, setTeams] = useState([]); // [[id, id], ...]
  const [leftover, setLeftover] = useState([]);
  const [mode, setMode] = useState('groups');
  const [groupCount, setGroupCount] = useState(2);
  const [advance, setAdvance] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const active = (members || []).filter((m) => m.is_active);
  const byId = useMemo(() => new Map(active.map((m) => [m.id, m])), [active]);
  const size = TEAM_SIZE[format];
  const complete = teams.filter((tm) => tm.length === size && tm.every(Boolean));
  const inTeams = new Set(teams.flat().filter(Boolean));

  function changeFormat(f) {
    setFormat(f);
    setTeams(f === 'singles' ? picked.map((id) => [id]) : []);
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
        club_id: club.id,
        name: name.trim(),
        format,
        group_count: groups,
        advance_per_group: Math.min(advance, perGroup || advance),
        teams: complete.map((tm) => ({ player_ids: tm })),
      });
      router.push(`/club/tournaments/${created.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const label = (m) => `${m.full_name}${m.gender ? ` (${t(`members.${m.gender}`)})` : ''}${m.dupr_level != null ? ` · ${m.dupr_level}` : ''}`;

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-4">{t('tournaments.create')}</h1>

      <Section n={1} title={t('tournaments.name')}>
        <input className="input mb-3" placeholder={t('tournaments.namePh')} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-3 bg-navy-950 rounded-lg p-1 text-sm">
          {Object.keys(TEAM_SIZE).map((f) => (
            <button key={f} type="button" onClick={() => changeFormat(f)} className={`rounded-md py-1.5 ${format === f ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-400'}`}>
              {t(`matches.${f}`)}
            </button>
          ))}
        </div>
        {format === 'mixed' && <p className="text-gray-500 text-xs mt-2">{t('matches.mixedHint')}</p>}
      </Section>

      <Section n={2} title={t('tournaments.players', { n: picked.length })}>
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
        </Section>
      )}

      <Section n={format === 'singles' ? 3 : 4} title={t('tournaments.structure')}>
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
      <button className="btn-primary w-full sm:w-auto" disabled={busy || !name.trim() || complete.length < 2} onClick={create}>
        {t('tournaments.createBtn')}
      </button>
    </AppShell>
  );
}
