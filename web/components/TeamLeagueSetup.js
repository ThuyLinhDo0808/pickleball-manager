'use client';
import { useMemo, useState } from 'react';
import Section from '@/components/NumberedSection';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

export const SUB_FORMATS = ['mens', 'womens', 'mixed', 'doubles', 'singles'];
const DEFAULT_DUPR = 3.0; // unrated players count as an average club player (same as the server)
const lvl = (m) => Number(m?.dupr_level ?? DEFAULT_DUPR);
const round2 = (n) => Math.round(n * 100) / 100;

// Does this roster have the men / women every chosen sub-match needs?
function missingFor(players, formats) {
  const men = players.filter((p) => p.gender === 'male').length;
  const women = players.filter((p) => p.gender === 'female').length;
  return [...new Set(formats)].filter((f) => (f === 'mens' ? men < 2 : f === 'womens' ? women < 2 : f === 'mixed' ? men < 1 || women < 1 : players.length < 2));
}

// Team League: teams of 4–8 play every other team once; each fixture holds several
// sub-matches (men's, women's, mixed doubles…). The builder balances total DUPR.
export default function TeamLeagueSetup({ club, active, base, ready, onCreated, initial }) {
  const { t } = useI18n();
  const [formats, setFormats] = useState(initial?.formats || ['mens', 'womens', 'mixed']);
  const [winRule, setWinRule] = useState(initial?.winRule || 'sub_wins');
  const [picked, setPicked] = useState(() => (initial ? initial.teams.flatMap((tm) => tm.ids) : []));
  const [teamCount, setTeamCount] = useState(initial ? initial.teams.length : 2);
  const [teams, setTeams] = useState(initial?.teams || []); // [{ name, ids: [] }]
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const byId = useMemo(() => new Map(active.map((m) => [m.id, m])), [active]);
  const assigned = new Set(teams.flatMap((tm) => tm.ids));
  const unassigned = picked.filter((id) => !assigned.has(id));
  const suggested = Math.max(2, Math.round(picked.length / 6));

  const info = teams.map((tm) => {
    const players = tm.ids.map((id) => byId.get(id)).filter(Boolean);
    return {
      players,
      total: round2(players.reduce((s, p) => s + lvl(p), 0)),
      men: players.filter((p) => p.gender === 'male').length,
      women: players.filter((p) => p.gender === 'female').length,
      missing: missingFor(players, formats),
    };
  });
  const totals = info.map((x) => x.total);
  const spread = totals.length ? round2(Math.max(...totals) - Math.min(...totals)) : 0;
  const fixtures = (teams.length * (teams.length - 1)) / 2;
  const blocking = info.some((x) => x.players.length < 2 || x.missing.length);

  function toggleFormat(f) {
    setFormats((fs) => (fs.includes(f) ? fs.filter((x) => x !== f) : SUB_FORMATS.filter((x) => fs.includes(x) || x === f)));
  }

  function togglePlayer(id) {
    const on = picked.includes(id);
    setPicked(on ? picked.filter((x) => x !== id) : [...picked, id]);
    if (on) setTeams((ts) => ts.map((tm) => ({ ...tm, ids: tm.ids.filter((x) => x !== id) })));
  }

  async function build(mode) {
    setError('');
    try {
      const n = Math.max(2, Math.min(16, Number(teamCount) || 2));
      const res = await api.post('/api/tournaments/team-builder', { club_id: club.id, player_ids: picked, team_count: n, mode });
      setTeams(res.teams.map((tm, i) => ({ name: teams[i]?.name || t('league.teamN', { n: i + 1 }), ids: tm.players.map((p) => p.id) })));
    } catch (err) {
      setError(err.message);
    }
  }

  // Move a player to team `to` (-1 = back to the bench).
  function move(id, to) {
    setTeams((ts) => ts.map((tm, i) => ({ ...tm, ids: i === to ? [...tm.ids.filter((x) => x !== id), id] : tm.ids.filter((x) => x !== id) })));
  }

  async function create() {
    setBusy(true);
    setError('');
    try {
      onCreated(
        await api.post('/api/tournaments', {
          ...base,
          kind: 'team',
          sub_formats: formats,
          win_rule: winRule,
          teams: teams.map((tm, i) => ({ name: tm.name.trim() || t('league.teamN', { n: i + 1 }), player_ids: tm.ids })),
        })
      );
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const label = (m) => `${m.full_name}${m.gender ? ` (${t(`members.${m.gender}`)})` : ''} · ${m.dupr_level ?? '—'}`;
  const sizeOk = (n) => n >= 4 && n <= 8;

  return (
    <>
      <Section n={2} title={t('league.subTitle')} hint={t('league.subHint')}>
        <div className="flex flex-wrap gap-2 mb-4">
          {SUB_FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={formats.includes(f)}
              onClick={() => toggleFormat(f)}
              className={`rounded-full border px-3 py-1.5 text-sm ${formats.includes(f) ? 'border-lime-400 bg-lime-400/10 text-lime-300' : 'border-navy-600 text-gray-400'}`}
            >
              {formats.includes(f) ? '✓ ' : ''}
              {t(`league.sub_${f}`)}
            </button>
          ))}
        </div>
        <label className="text-xs text-gray-400 block mb-1">{t('league.winRule')}</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {['sub_wins', 'points'].map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={winRule === r}
              onClick={() => setWinRule(r)}
              className={`rounded-lg border p-3 text-left text-sm ${winRule === r ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300'}`}
            >
              <div className="font-semibold">{t(`league.rule_${r}`)}</div>
              <div className="text-gray-400 text-xs mt-0.5">{t(`league.rule_${r}Hint`, { n: formats.length, k: Math.floor(formats.length / 2) + 1 })}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section n={3} title={t('tournaments.players', { n: picked.length })}>
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
        {active.some((m) => !m.gender) && <p className="text-yellow-400 text-xs mt-2">{t('league.needGender')}</p>}
      </Section>

      <Section n={4} title={t('league.teamsTitle', { n: teams.length })} hint={t('league.builderHint')}>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <div className="w-28">
            <label className="text-xs text-gray-400">{t('league.teamCount')}</label>
            <input className="input" type="number" inputMode="numeric" min="2" max="16" value={teamCount} onChange={(e) => setTeamCount(e.target.value)} />
          </div>
          <button type="button" className="btn-primary text-sm" disabled={picked.length < 4} onClick={() => build('balanced')}>⚖️ {t('league.buildBalanced')}</button>
          <button type="button" className="btn-secondary text-sm" disabled={picked.length < 4} onClick={() => build('random')}>🎲 {t('tournaments.pairRandom')}</button>
        </div>
        {picked.length >= 4 && Number(teamCount) !== suggested && (
          <p className="text-gray-500 text-xs mb-3">
            {t('league.suggest', { n: suggested, size: Math.round(picked.length / suggested) })}{' '}
            <button type="button" className="text-lime-400" onClick={() => setTeamCount(suggested)}>{t('league.use')}</button>
          </p>
        )}

        {teams.length > 0 && (
          <p className={`text-sm mb-3 ${spread <= 0.5 ? 'text-lime-400' : 'text-yellow-300'}`}>
            {t('league.spread', { spread })}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {teams.map((tm, ti) => (
            <div key={ti} className="rounded-xl border border-navy-600 bg-navy-900 p-3">
              <div className="flex items-center gap-2 mb-2">
                <input className="input !py-1.5 font-semibold" value={tm.name} onChange={(e) => setTeams((ts) => ts.map((x, i) => (i === ti ? { ...x, name: e.target.value } : x)))} />
                <button type="button" className="text-red-400 text-xs shrink-0" onClick={() => setTeams((ts) => ts.filter((_, i) => i !== ti))}>{t('tournaments.remove')}</button>
              </div>
              <div className="flex flex-wrap gap-x-3 text-xs mb-2">
                <span className="text-lime-400 font-semibold">Σ DUPR {info[ti].total}</span>
                <span className={sizeOk(info[ti].players.length) ? 'text-gray-400' : 'text-yellow-300'}>{t('league.size', { n: info[ti].players.length })}</span>
                <span className="text-gray-400">♂ {info[ti].men} · ♀ {info[ti].women}</span>
              </div>
              <ul className="flex flex-col gap-1">
                {info[ti].players.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate text-gray-200">{label(p)}</span>
                    <select aria-label={t('league.moveTo')} className="input !py-1 !w-auto text-xs" value={ti} onChange={(e) => move(p.id, Number(e.target.value))}>
                      {teams.map((x, i) => <option key={i} value={i}>{x.name || t('league.teamN', { n: i + 1 })}</option>)}
                      <option value={-1}>{t('league.bench')}</option>
                    </select>
                  </li>
                ))}
              </ul>
              {info[ti].missing.length > 0 && (
                <p className="text-red-400 text-xs mt-2">{t('league.missing', { list: info[ti].missing.map((f) => t(`league.sub_${f}`)).join(', ') })}</p>
              )}
            </div>
          ))}
        </div>

        {teams.length > 0 && unassigned.length > 0 && (
          <div className="mt-3">
            <p className="text-yellow-300 text-xs mb-1">{t('league.benchN', { n: unassigned.length })}</p>
            <ul className="flex flex-col gap-1">
              {unassigned.map((id) => byId.get(id)).filter(Boolean).map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate text-gray-300">{label(p)}</span>
                  <select className="input !py-1 !w-auto text-xs" value="" onChange={(e) => e.target.value !== '' && move(p.id, Number(e.target.value))}>
                    <option value="">{t('league.addTo')}</option>
                    {teams.map((x, i) => <option key={i} value={i}>{x.name || t('league.teamN', { n: i + 1 })}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button type="button" className="text-lime-400 text-sm mt-3" onClick={() => setTeams((ts) => [...ts, { name: t('league.teamN', { n: ts.length + 1 }), ids: [] }])}>
          {t('tournaments.addTeam')}
        </button>
      </Section>

      <Section n={5} title={t('league.summaryTitle')}>
        <p className="text-gray-300 text-sm">
          {t('league.summary', { teams: teams.length, fixtures, subs: fixtures * formats.length, per: formats.length })}
        </p>
      </Section>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {!base.name && <p className="text-gray-500 text-xs mb-2">{t('tournaments.needName')}</p>}
      {formats.length === 0 && <p className="text-gray-500 text-xs mb-2">{t('league.needSub')}</p>}
      {teams.length < 2 && <p className="text-gray-500 text-xs mb-2">{t('tournaments.needTeams')}</p>}
      <button className="btn-primary w-full sm:w-auto" disabled={busy || !ready || teams.length < 2 || !formats.length || blocking} onClick={create}>
        {t('tournaments.createBtn')}
      </button>
    </>
  );
}
