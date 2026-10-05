'use client';
import { levelText } from '@/lib/levels';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import DatePopover from '@/components/DatePopover';
import TeamLeagueSetup from '@/components/TeamLeagueSetup';
import Section from '@/components/NumberedSection';
import { todayYmd } from '@/lib/dates';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';


export default function NewTournamentPage() {
  const { t, sport } = useI18n();
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
        setKind(tr.kind === 'team' ? 'team' : tr.group_count === 1 && tr.advance_per_group === 0 ? 'rr' : 'pairs');
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
                teams: tr.teams.map((tm) => (tr.format === 'singles' ? [tm.player1_id] : [tm.player1_id, tm.player2_id || BLANK])),
                category: categoryOf(tr.format, tr.division),
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
      <PageHeader
        icon="🏆"
        title={from ? t('tournaments.editTitle') : t('nav.createTournament')}
        subtitle={club?.name}
        actions={
          <Link href={from ? `/club/tournaments/${from.id}` : '/club/tournaments'} className="btn-secondary text-sm">
            {from ? `← ${from.name}` : `📋 ${t('tournaments.allList')}`}
          </Link>
        }
      />
      <SectionTabs group="activities" />
      {from && <p className="card !py-3 mb-4 border-yellow-400/50 text-yellow-200 text-sm">✏️ {t('tournaments.editHint')}</p>}
      {loadingFrom && <p className="text-gray-400 text-sm mb-4">{t('common.loading')}</p>}

      <Section n={1} title={t('tournaments.kindTitle')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {['pairs', 'rr', 'team'].map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-xl border p-4 text-left transition flex gap-3 items-start ${kind === k ? 'border-lime-400 bg-lime-400/10 ring-1 ring-lime-400/40' : 'border-navy-600 hover:border-navy-500'}`}
            >
              <span className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center text-xl ${kind === k ? 'bg-lime-400/20' : 'bg-navy-900'}`} aria-hidden="true">
                {k === 'pairs' ? (sport === 'badminton' ? '🏸' : '🏓') : k === 'rr' ? '🔄' : '👥'}
              </span>
              <span className="min-w-0">
                <span className="block text-white font-semibold">{t(`tournaments.kind_${k}`)}</span>
                <span className="block text-gray-400 text-xs mt-0.5">{t(`tourx.kindDesc_${k}`)}</span>
              </span>
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
              <input className="input" type="number" inputMode="numeric" min="0" step="1" placeholder="0" value={info.entry_fee} onChange={(e) => setI({ entry_fee: e.target.value })} />
            </div>
            <p className="text-gray-400 text-xs">{t('tournaments.entryFeeHint')}</p>
          </div>
        </div>
        {timeError && <p className="text-red-400 text-xs mt-2">{timeError}</p>}
      </Section>

      {!loadingFrom &&
        (kind !== 'team' ? (
          <PairsSetup key={`${kind}${from?.id || ''}`} roundRobin={kind === 'rr'} club={club} active={active} base={base} ready={ready} onCreated={done} initial={from?.kind !== 'team' ? prefill : null} />
        ) : (
          <TeamLeagueSetup key={`t${from?.id || ''}`} club={club} active={active} base={base} ready={ready} onCreated={done} initial={from?.kind === 'team' ? prefill : null} />
        ))}
    </AppShell>
  );
}

// Events (nội dung). Pickleball: men's / women's / mixed doubles. Badminton adds the
// singles. 'od' (open doubles) only comes back when editing an older tournament.
const CATEGORIES = {
  ms: { format: 'singles', division: 'men' },
  ws: { format: 'singles', division: 'women' },
  md: { format: 'doubles', division: 'men' },
  wd: { format: 'doubles', division: 'women' },
  xd: { format: 'mixed', division: 'open' },
  od: { format: 'doubles', division: 'open' },
};
const PICKLEBALL_CATS = ['md', 'wd', 'xd'];
const BADMINTON_CATS = ['ms', 'ws', 'md', 'wd', 'xd'];
const TEAM_SIZE = { singles: 1, doubles: 2, mixed: 2 };
const BLANK = '__blank__'; // a place left empty on purpose: a guest is invited later
function categoryOf(format, division) {
  return Object.keys(CATEGORIES).find((k) => CATEGORIES[k].format === format && CATEGORIES[k].division === division) || null;
}
const GENDER_OF = { men: 'male', women: 'female' };

function PairsSetup({ club, active: allActive, base, ready, onCreated, initial, roundRobin = false }) {
  const { t, sport } = useI18n();
  const badminton = sport === 'badminton';
  const cats = badminton ? BADMINTON_CATS : PICKLEBALL_CATS;
  const [cat, setCat] = useState(initial?.category || 'md');
  const { format, division } = CATEGORIES[cat] || CATEGORIES.md;
  const size = TEAM_SIZE[format];
  const want = GENDER_OF[division];
  // Who may play this event: men's / women's → that gender; mixed → anyone with a gender.
  const eligible = useMemo(
    () => allActive.filter((m) => (want ? m.gender === want : format === 'mixed' ? m.gender === 'male' || m.gender === 'female' : true)),
    [allActive, want, format]
  );
  const noGender = format === 'mixed' || want ? allActive.filter((m) => m.gender !== 'male' && m.gender !== 'female') : [];
  const [picked, setPicked] = useState(() => (initial ? initial.teams.flat().filter((x) => x && x !== BLANK) : []));
  const [teams, setTeams] = useState(() => (initial ? initial.teams.map((tm) => [...tm]) : []));
  const [custom, setCustom] = useState(!!initial);
  const [mode, setMode] = useState(initial?.mode || 'groups');
  const [groupCount, setGroupCount] = useState(initial?.groupCount || 2);
  const [advance, setAdvance] = useState(initial?.advance || 2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function pickCategory(k) {
    setCat(k);
    setPicked([]);
    setTeams([]);
    setCustom(false);
  }

  const byId = useMemo(() => new Map(allActive.map((m) => [m.id, m])), [allActive]);
  const pickedPlayers = picked.map((id) => byId.get(id)).filter(Boolean);
  const inTeams = new Set(teams.flat().filter((x) => x && x !== BLANK));
  const unpaired = pickedPlayers.filter((m) => !inTeams.has(m.id));
  const unrated = pickedPlayers.filter((m) => m.dupr_level == null || m.dupr_level === '');
  const men = pickedPlayers.filter((m) => m.gender === 'male').length;
  const women = pickedPlayers.filter((m) => m.gender === 'female').length;
  // What the chosen event is short of, so every pair is complete.
  const shortage =
    size === 1
      ? null
      : format === 'mixed'
        ? men > women
          ? { n: men - women, g: 'female' }
          : women > men
            ? { n: women - men, g: 'male' }
            : null
        : pickedPlayers.length % 2
          ? { n: 1, g: want || 'any' }
          : null;

  const isFilled = (v) => v && v !== BLANK;
  const complete = teams.filter((tm) => tm.length === size && tm.every((v) => v === BLANK || v) && tm.some(isFilled));
  const incomplete = teams.length - complete.length;
  const blanks = teams.reduce((n, tm) => n + tm.filter((v) => v === BLANK).length, 0);

  function togglePlayer(id) {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    setTeams((ts) => ts.map((tm) => tm.map((x) => (x === BLANK || next.includes(x) ? x : ''))));
  }

  // Balanced: strong + weaker together (mixed: a man with a woman). Players left over
  // (odd number, more men than women…) get a pair with an empty place to fill later.
  async function balanced() {
    setError('');
    try {
      const res = await api.post('/api/tournaments/pairing', { club_id: club.id, format, mode: 'balanced', player_ids: picked });
      const made = res.teams.map((tm) => tm.players.map((p) => p.id));
      const rest = res.leftover.map((p) => p.id).filter((id) => byId.get(id) && (format !== 'mixed' || ['male', 'female'].includes(byId.get(id).gender)));
      if (size === 1) setTeams([...made, ...rest.map((id) => [id])]);
      else if (format === 'mixed') setTeams([...made, ...rest.map((id) => [id, BLANK])]);
      else {
        const extra = [];
        for (let i = 0; i < rest.length; i += 2) extra.push([rest[i], rest[i + 1] || BLANK]);
        setTeams([...made, ...extra]);
      }
      setCustom(false);
    } catch (err) {
      setError(err.message);
    }
  }

  function startCustom() {
    setCustom(true);
    if (!teams.length) setTeams(Array.from({ length: Math.max(2, Math.ceil(picked.length / size)) }, () => Array(size).fill('')));
  }

  function setSlot(ti, pi, v) {
    setTeams((ts) => ts.map((tm, i) => (i === ti ? tm.map((x, j) => (j === pi ? v : x)) : tm)));
  }

  // Mixed: the other place of a pair decides the gender this place needs.
  function optionsFor(tm, pi) {
    const mate = byId.get(tm[1 - pi]);
    return pickedPlayers.filter((m) => !inTeams.has(m.id) && (format !== 'mixed' || !mate || m.gender !== mate.gender));
  }

  const groups = roundRobin ? 1 : mode === 'groups' ? Math.max(1, Math.min(groupCount, Math.floor(complete.length / 2) || 1)) : 0;
  const perGroup = groups ? Math.floor(complete.length / groups) : 0;
  const groupMatches = groups
    ? Array.from({ length: groups }, (_, g) => {
        const n = Math.floor(complete.length / groups) + (g < complete.length % groups ? 1 : 0);
        return (n * (n - 1)) / 2;
      }).reduce((a2, b2) => a2 + b2, 0)
    : 0;

  async function create() {
    setBusy(true);
    setError('');
    try {
      const created = await api.post('/api/tournaments', {
        ...base,
        kind: 'pairs',
        ...(roundRobin ? { mode: 'round_robin' } : {}),
        format,
        division,
        group_count: groups,
        advance_per_group: Math.min(advance, perGroup || advance),
        teams: complete.map((tm) => ({ player_ids: tm.map((v) => (v === BLANK ? null : v)) })),
      });
      onCreated(created);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const levelOf = (m) => (m.dupr_level != null && m.dupr_level !== '' ? levelText(m.dupr_level, sport, t) : null);
  const label = (m) => `${m.full_name}${m.gender ? ` (${t(`members.${m.gender}`)})` : ''}${levelOf(m) ? ` · ${levelOf(m)}` : ''}`;
  const genderWord = (g) => (g === 'male' ? t('pairing.man') : g === 'female' ? t('pairing.woman') : t('pairing.player'));

  // One place of a pair: a name chip (× in custom mode), a dashed "empty — invite later"
  // chip, or (custom mode) a picker.
  const slot = (tm, ti, pi) => {
    const v = tm[pi];
    if (v === BLANK) {
      return (
        <span className="flex-1 min-w-0 flex items-center gap-2 rounded-lg border border-dashed border-amber-300/60 bg-amber-300/5 px-3 py-2 text-amber-200 text-sm">
          <span className="truncate flex-1">⬚ {t('pairing.blank')}</span>
          {custom && <button type="button" aria-label={t('pairing.remove')} className="text-amber-200/80 hover:text-white" onClick={() => setSlot(ti, pi, '')}>×</button>}
        </span>
      );
    }
    if (v) {
      const m = byId.get(v);
      return (
        <span className="flex-1 min-w-0 flex items-center gap-2 rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm">
          <span className="truncate flex-1 text-white">{m ? label(m) : '?'}</span>
          {custom && <button type="button" aria-label={`${t('pairing.remove')} ${m?.full_name || ''}`} className="text-gray-400 hover:text-red-300 text-base leading-none" onClick={() => setSlot(ti, pi, '')}>×</button>}
        </span>
      );
    }
    if (!custom) return <span className="flex-1 rounded-lg border border-red-500/50 px-3 py-2 text-red-300 text-sm">{t('pairing.empty')}</span>;
    return (
      <select className="input text-sm flex-1 min-w-0 !border-red-500/50" value="" onChange={(e) => setSlot(ti, pi, e.target.value)} aria-label={t('tournaments.pick')}>
        <option value="">{t('tournaments.pick')}</option>
        {optionsFor(tm, pi).map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}
        {size === 2 && <option value={BLANK}>⬚ {t('pairing.blankOption')}</option>}
      </select>
    );
  };

  let n = 2;
  return (
    <>
      <Section n={n++} title={t('tournaments.category')}>
        <div className={`grid gap-2 ${cats.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-5'}`}>
          {cats.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={cat === k}
              onClick={() => pickCategory(k)}
              className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${cat === k ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}
            >
              {t(`tournaments.cat_${k}`)}
            </button>
          ))}
        </div>
        <p className="text-gray-500 text-xs mt-2">{t(`pairing.catHint_${cat}`)}</p>
      </Section>

      <Section n={n++} title={t('tournaments.players', { n: picked.length })}>
        <div className="flex flex-wrap items-center gap-3 mb-2 text-sm">
          <button type="button" className="text-lime-400" onClick={() => setPicked(eligible.map((m) => m.id))}>
            {t('tournaments.selectAll')}
          </button>
          {picked.length > 0 && (
            <button type="button" className="text-gray-400 hover:text-white" onClick={() => { setPicked([]); setTeams([]); }}>
              {t('memx.clearSel')}
            </button>
          )}
          <span className="ml-auto text-gray-400 text-xs">
            {t('tourx.pickedOf', { n: picked.length, total: eligible.length })}
            {format === 'mixed' && ` · ${t('pairing.menWomen', { m: men, w: women })}`}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-80 overflow-y-auto pr-1">
          {eligible.map((m) => {
            const on = picked.includes(m.id);
            return (
              <label key={m.id} className={`flex items-center gap-2 text-sm rounded-lg border px-2.5 py-1.5 cursor-pointer transition ${on ? 'border-lime-400/70 bg-lime-400/10 text-white' : 'border-navy-700 text-gray-300 hover:border-navy-500'}`}>
                <input type="checkbox" checked={on} onChange={() => togglePlayer(m.id)} />
                <span className="truncate flex-1">{label(m)}</span>
                {levelOf(m) == null && <span className="text-[10px] rounded border border-amber-300/60 text-amber-200 px-1 shrink-0">{t('pairing.noLevel')}</span>}
              </label>
            );
          })}
        </div>
        {noGender.length > 0 && (
          <p className="text-amber-200 text-xs mt-2">⚠️ {t('pairing.noGender', { names: noGender.map((m) => m.full_name).join(', ') })}</p>
        )}
        {shortage && (
          <div className="mt-3 rounded-lg border border-amber-300/50 bg-amber-300/5 px-3 py-2 text-sm">
            <p className="text-amber-200 font-semibold">⚠️ {t('pairing.short', { cat: t(`tournaments.cat_${cat}`), n: shortage.n, g: genderWord(shortage.g) })}</p>
            <p className="text-gray-300 text-xs mt-0.5">{t('pairing.shortHint')}</p>
          </div>
        )}
      </Section>

      <Section n={n++} title={t('tournaments.teams', { n: complete.length })}>
        <div className="flex flex-wrap gap-2 mb-2">
          <button type="button" className="btn-primary text-sm" disabled={picked.length < 2 || unrated.length > 0} onClick={balanced}>
            ⚖️ {t('tournaments.pairBalanced')}
          </button>
          <button type="button" className={`text-sm ${custom ? 'btn-primary' : 'btn-secondary'}`} disabled={picked.length < 1} onClick={() => (custom ? setCustom(false) : startCustom())}>
            ✏️ {custom ? t('pairing.customDone') : t('pairing.custom')}
          </button>
        </div>
        {unrated.length > 0 && (
          <div className="mb-3 rounded-lg border border-red-500/50 bg-red-500/5 px-3 py-2 text-sm">
            <p className="text-red-300 font-semibold">⚠️ {t('pairing.unrated', { n: unrated.length })}</p>
            <p className="text-gray-300 text-xs mt-0.5">{unrated.map((m) => m.full_name).join(', ')}</p>
            <p className="text-gray-400 text-xs mt-1">{t('pairing.unratedHint')}</p>
          </div>
        )}
        <p className="text-gray-500 text-xs mb-3">{custom ? t('pairing.customHint') : t('pairing.balancedHint')}</p>
        <div className="flex flex-col gap-2">
          {teams.map((tm, ti) => (
            <div key={ti} className="flex items-center gap-2">
              <span className="text-gray-500 text-xs w-6 shrink-0">{ti + 1}.</span>
              {tm.map((_, pi) => <span key={pi} className="contents">{slot(tm, ti, pi)}</span>)}
              {custom && (
                <button type="button" className="text-red-400 text-xs px-1 shrink-0" onClick={() => setTeams((ts) => ts.filter((_, i) => i !== ti))}>
                  {t('tournaments.remove')}
                </button>
              )}
            </div>
          ))}
        </div>
        {custom && (
          <button type="button" className="text-lime-400 text-sm mt-2" onClick={() => setTeams((ts) => [...ts, Array(size).fill('')])}>
            {t('tournaments.addTeam')}
          </button>
        )}
        {incomplete > 0 && <p className="text-red-400 text-sm mt-2">⚠️ {t('pairing.incomplete', { n: incomplete })}</p>}
        {blanks > 0 && <p className="text-amber-200 text-sm mt-1">⬚ {t('pairing.blanksNote', { n: blanks })}</p>}
        {teams.length > 0 && unpaired.length > 0 && <p className="text-yellow-300 text-sm mt-1">{t('tournaments.unpaired', { names: unpaired.map((m) => m.full_name).join(', ') })}</p>}
      </Section>

      {roundRobin ? (
        <Section n={n++} title={t('tournaments.structure')}>
          <p className="text-gray-300 text-sm">{t('tournaments.summaryRr', { teams: complete.length, matches: (complete.length * (complete.length - 1)) / 2 })}</p>
          <p className="text-gray-500 text-xs mt-1">{t('tournaments.rrHint')}</p>
        </Section>
      ) : (
      <Section n={n++} title={t('tournaments.structure')}>
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
      )}

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {complete.length < 2 && <p className="text-gray-500 text-xs mb-2">{t('tournaments.needTeams')}</p>}
      {!base.name && <p className="text-gray-500 text-xs mb-2">{t('tournaments.needName')}</p>}
      <button className="btn-primary w-full sm:w-auto" disabled={busy || !ready || complete.length < 2 || incomplete > 0} onClick={create}>
        {t('tournaments.createBtn')}
      </button>
    </>
  );
}
