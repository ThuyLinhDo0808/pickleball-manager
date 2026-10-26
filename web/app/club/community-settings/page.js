'use client';
import Hint from '@/components/ui/Hint';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import UiIcon from '@/components/ui/UiIcon';
import ChipRow from '@/components/ui/ChipRow';

// 'experience' (by Thời gian chơi) is no longer offered; a community still on it keeps working.
const MODES = ['none', 'manual', 'score'];
const DURATIONS = ['lt6', '6_12', '12_18', 'gt18'];

// Ready-made level sets the Host can start from (then rename / change).
function preset(mode, sport, t) {
  if (mode === 'manual') return ['A', 'B', 'C', 'D'].map((l) => ({ label: `Series ${l}`, dupr_min: '', dupr_max: '' }));
  if (mode === 'score') {
    return sport === 'badminton'
      ? [{ label: t('cpanel.p_new'), min: null }, { label: t('cpanel.p_mid'), min: 3 }, { label: t('cpanel.p_good'), min: 5 }]
      : [{ label: t('cpanel.p_new'), min: null }, { label: t('cpanel.p_mid'), min: 3 }, { label: t('cpanel.p_good'), min: 3.5 }, { label: t('cpanel.p_strong'), min: 4 }];
  }
  if (mode === 'experience') return DURATIONS.map((d) => ({ label: t(`memberX.dur_${d}`), buckets: [d] }));
  return [];
}

// One group of settings: a heading with a short line under it, then its rows.
function Section({ id, icon, title, lead, children }) {
  return (
    <section id={id} className="scroll-mt-20 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <UiIcon name={icon} className="w-5 h-5 text-lime-300" />
        <h2 className="text-white text-lg font-semibold">{title}</h2>
      </div>
      {lead && <p className="text-gray-400 text-sm mb-3">{lead}</p>}
      <div className="card !p-0 divide-y divide-navy-700">{children}</div>
    </section>
  );
}

// One setting: what it is on the left, the control on the right (stacked on phones).
function Row({ title, hint, desc, children, wide = false }) {
  return (
    <div className={`px-4 py-4 sm:px-5 ${wide ? '' : 'sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-6'}`}>
      <div className="min-w-0">
        <h3 className="text-white text-sm font-semibold flex items-center gap-1.5">{title}{hint && <Hint inline text={hint} />}</h3>
        {desc && <p className="text-gray-400 text-xs mt-0.5">{desc}</p>}
      </div>
      <div className={wide ? 'mt-3' : 'mt-3 sm:mt-0'}>{children}</div>
    </div>
  );
}

const Toggle = ({ checked, onChange, label }) => (
  <label className="inline-flex items-center gap-2 min-h-[44px] sm:min-h-0 cursor-pointer text-sm text-gray-200">
    <input type="checkbox" className="h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

const NumberField = ({ value, onChange, min, max, unit, placeholder, label }) => (
  <span className="inline-flex items-center gap-2 text-sm text-gray-300">
    <input type="number" min={min} max={max} className="input !w-20 !py-1.5 text-center tabular-nums" value={value ?? ''} placeholder={placeholder} aria-label={label} onChange={(e) => onChange(e.target.value)} />
    {unit}
  </span>
);

// Ranking tabs a Host can start from (then rename / change the scores).
const RANK_PRESET = [
  { label: '3.5++', min: 3.5, max: '' },
  { label: '3.0 – 3.5', min: 3, max: 3.49 },
  { label: '< 3.0', min: '', max: 2.99 },
];

const SECTIONS = [
  { id: 'sec-members', icon: 'users', key: 'cpanel.groupMembers' },
  { id: 'sec-signup', icon: 'ticket', key: 'cpanel.groupSignup' },
  { id: 'sec-levels', icon: 'medal', key: 'cpanel.groupLevels' },
];

// Social Manager control panel, in three groups: Thành viên (regular / drop-in, active),
// Đăng ký kèo (info check, refund rule) and Trình độ & xếp hạng (levels, ranking tabs).
// One Save for the page; the bar says when something is not saved yet.
export default function CommunitySettingsPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const { data, error, reload } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/community-settings`) : Promise.resolve(null)), [club?.id]);
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [saved, setSaved] = useState('');
  const canEdit = !club?.role || ['owner', 'co_admin'].includes(club.role);
  const sport = data?.sport || club?.sport || 'pickleball';

  useEffect(() => {
    if (data?.settings) {
      setS(JSON.parse(JSON.stringify(data.settings)));
      setSaved(JSON.stringify(data.settings));
    }
  }, [data]);

  const set = (patch) => setS((x) => ({ ...x, ...patch }));
  const setLevels = (patch) => setS((x) => ({ ...x, levels: { ...x.levels, ...patch } }));
  const setRank = (patch) => setS((x) => ({ ...x, rankings: { ...(x.rankings || { split: 'none', groups: [] }), ...patch } }));
  const setItem = (i, patch) => setLevels({ items: s.levels.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
  const errText = (e) => {
    const code = e.payload?.code;
    return t(`cpanel.err_${code}`) === `cpanel.err_${code}` ? e.message : t(`cpanel.err_${code}`);
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.put(`/api/clubs/${club.id}/community-settings`, s);
      setS(r.settings);
      setSaved(JSON.stringify(r.settings));
      setMsg({ ok: true, text: r.moved ? t('cpanel.savedMoved', { up: r.moved.to_regular, down: r.moved.to_dropin }) : t('cpanel.saved') });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  }
  async function runNow() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.post(`/api/clubs/${club.id}/community-settings/reclassify`);
      setMsg({ ok: true, text: t('cpanel.movedNow', { up: r.to_regular, down: r.to_dropin, n: r.checked }) });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  const header = <PageHeader icon="settings" title={t('cpanel.title')} subtitle={club?.name} />;
  if (error) return <AppShell>{header}<p className="card text-red-300 text-sm">{error.message}</p></AppShell>;
  if (!s) return <AppShell>{header}<p className="text-gray-400 text-sm">{t('common.loading')}</p></AppShell>;
  if (data && !data.ready) return <AppShell>{header}<p className="card text-amber-200 text-sm">{t('cpanel.err_migration_required')}</p></AppShell>;
  if (data?.kind !== 'community') return <AppShell>{header}<p className="card text-gray-300 text-sm">{t('cpanel.onlyCommunity')}</p></AppShell>;

  const mode = s.levels.mode;
  const items = s.levels.items;
  const usedBuckets = (i) => new Set(items.flatMap((it, k) => (k === i ? [] : it.buckets || [])));
  const r = s.refund || { mode: 'tiers', full: 12, half: 6 };
  const setR = (patch) => set({ refund: { ...r, ...patch } });
  const rk = s.rankings || { split: 'none', groups: [] };
  const rkGroups = rk.groups || [];
  const setGroup = (i, patch) => setRank({ groups: rkGroups.map((g, k) => (k === i ? { ...g, ...patch } : g)) });
  const tabs = [t('homeRank.wholeCommunity'), ...(rk.split === 'levels' ? items.map((i) => i.label) : rk.split === 'dupr' ? rkGroups.map((g) => g.label) : [])].filter(Boolean);
  const dirty = JSON.stringify(s) !== saved;
  const step = sport === 'badminton' ? 1 : 0.05;
  const top = sport === 'badminton' ? 6 : 8;

  return (
    <AppShell>
      {header}
      <Hint className="mb-4 -mt-2" text={t('cpanel.intro')} />
      {/* Phones: jump to a group. */}
      <nav className="lg:hidden flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1" aria-label={t('cpanel.title')}>
        {SECTIONS.map((x) => (
          <a key={x.id} href={`#${x.id}`} className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] rounded-full border border-navy-600 px-3 text-sm text-gray-200">
            <UiIcon name={x.icon} className="w-4 h-4" />
            {t(x.key)}
          </a>
        ))}
      </nav>
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        {/* Desktop: the groups as a list that stays in view. */}
        <nav className="hidden lg:block" aria-label={t('cpanel.title')}>
          <ul className="sticky top-6 flex flex-col gap-1">
            {SECTIONS.map((x) => (
              <li key={x.id}>
                <a href={`#${x.id}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-navy-800 hover:text-white">
                  <UiIcon name={x.icon} className="w-4 h-4" />
                  {t(x.key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <fieldset disabled={!canEdit || busy} className="min-w-0">
          <Section id="sec-members" icon="users" title={t('cpanel.groupMembers')} lead={t('cpanel.groupMembersLead')}>
            <Row title={t('cpanel.regularTitle')} hint={t('cpanel.regularHint')} desc={t('cpanel.dropinBelow', { n: s.regular.min || '?' })}>
              <span className="inline-flex flex-wrap items-center gap-2 text-sm text-gray-300">
                {t('cpanel.regularFrom')}
                <NumberField min={0} max={30} value={s.regular.min} label={t('cpanel.regularTitle')} onChange={(v) => set({ regular: { ...s.regular, min: v } })} unit={t('cpanel.regularUnit')} />
              </span>
            </Row>
            <Row title={t('cpanel.auto')} desc={t('cpanel.autoHint')}>
              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <Toggle checked={s.regular.auto} onChange={(v) => set({ regular: { ...s.regular, auto: v } })} label={s.regular.auto ? t('cpanel.on') : t('cpanel.off')} />
                <button type="button" className="btn-secondary text-sm" onClick={runNow}><UiIcon name="refresh" className="w-4 h-4" />{t('cpanel.runNow')}</button>
              </div>
            </Row>
            <Row title={t('cpanel.activeTitle')} hint={t('cpanel.activeHint')} desc={t('cpanel.inactiveAfter')}>
              <NumberField min={7} max={180} value={s.active_days} label={t('cpanel.activeTitle')} onChange={(v) => set({ active_days: v })} unit={t('cpanel.days')} />
            </Row>
          </Section>

          <Section id="sec-signup" icon="ticket" title={t('cpanel.groupSignup')} lead={t('cpanel.groupSignupLead')}>
            <Row title={t('cpanel.signupTitle')} hint={t('cpanel.signupHint')} desc={t(s.signup?.auto_dupr ? 'cpanel.autoDuprOn' : 'cpanel.autoDuprOff')}>
              {(club?.sport || 'pickleball') === 'pickleball' ? (
                <Toggle checked={!!s.signup?.auto_dupr} onChange={(v) => set({ signup: { ...(s.signup || {}), auto_dupr: v } })} label={t('cpanel.autoDupr')} />
              ) : (
                <span className="text-sm text-gray-400">—</span>
              )}
            </Row>
            <Row title={t('cpanel.refundTitle')} hint={t('cpanel.refundHint')} wide>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label={t('cpanel.refundTitle')}>
                {['tiers', 'free', 'none'].map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={r.mode === m} onClick={() => setR({ mode: m })} className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm text-left ${r.mode === m ? 'border-lime-400 bg-lime-400/10 text-white font-semibold' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}>
                    {t(`cpanel.refund_${m}`)}
                  </button>
                ))}
              </div>
              {r.mode === 'tiers' && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-900 px-3 py-2 text-sm text-gray-300">
                    {t('cpanel.refundFull')}
                    <NumberField min={0} max={168} value={r.full} label={t('cpanel.refundFull')} onChange={(v) => setR({ full: v })} unit={t('cpanel.hours')} />
                  </label>
                  <label className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-900 px-3 py-2 text-sm text-gray-300">
                    {t('cpanel.refundHalf')}
                    <NumberField min={0} max={167} value={r.half} placeholder="—" label={t('cpanel.refundHalf')} onChange={(v) => setR({ half: v })} unit={t('cpanel.hours')} />
                  </label>
                </div>
              )}
            </Row>
          </Section>

          <Section id="sec-levels" icon="medal" title={t('cpanel.groupLevels')} lead={t('cpanel.groupLevelsLead')}>
            <Row title={t('cpanel.levelTitle')} hint={t('cpanel.levelHint')} wide>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('cpanel.levelTitle')}>
                {(mode === 'experience' ? [...MODES, 'experience'] : MODES).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setLevels({ mode: m, items: m === mode ? items : m === 'none' ? [] : preset(m, sport, t) })}
                    className={`rounded-xl border p-3 text-left text-sm transition ${mode === m ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}
                  >
                    <span className="font-semibold">{t(`cpanel.mode_${m}${m === 'score' && sport === 'badminton' ? '_b' : ''}`)}</span>
                    <span className="block text-xs text-gray-400 mt-0.5">{t(`cpanel.modeHint_${m}`)}</span>
                  </button>
                ))}
              </div>

              {['manual', 'score'].includes(mode) && (
                <label className="mt-4 flex items-start gap-3 text-sm text-gray-200 cursor-pointer rounded-lg border border-navy-600 px-3 py-2">
                  <input type="checkbox" className="mt-1" checked={!!s.levels?.by_gender} onChange={(e) => setLevels({ by_gender: e.target.checked })} />
                  <span>
                    {t('cpanel.byGender')}
                    <span className="block text-xs text-gray-500">{t('cpanel.byGenderHint')}</span>
                  </span>
                </label>
              )}
              {mode !== 'none' && (
                <div className="mt-4 flex flex-col gap-2">
                  {items.map((it, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-navy-900 px-3 py-2">
                      <span className="w-6 text-xs text-gray-500 tabular-nums">{i + 1}.</span>
                      <input className="input !w-44 !py-1.5 text-sm" maxLength={30} placeholder={t('cpanel.levelName')} aria-label={t('cpanel.levelName')} value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} />
                      {mode === 'manual' && (
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                          {s.levels?.by_gender ? `${t('levels.men')}:` : t(sport === 'badminton' ? 'cpanel.rangeStep' : 'cpanel.rangeDupr')}
                          <input type="number" step={sport === 'badminton' ? 1 : 0.05} min={0} max={sport === 'badminton' ? 6 : 8} className="input !w-24 !py-1.5 text-sm" placeholder="—" aria-label={t('cpanel.rangeFromAria', { name: it.label })} value={it.dupr_min ?? ''} onChange={(e) => setItem(i, { dupr_min: e.target.value })} />
                          {t('cpanel.rangeTo')}
                          <input type="number" step={sport === 'badminton' ? 1 : 0.05} min={0} max={sport === 'badminton' ? 6 : 8} className="input !w-24 !py-1.5 text-sm" placeholder="—" aria-label={t('cpanel.rangeToAria', { name: it.label })} value={it.dupr_max ?? ''} onChange={(e) => setItem(i, { dupr_max: e.target.value })} />
                        </span>
                      )}
                      {mode === 'manual' && s.levels?.by_gender && (
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-pink-200">
                          {t('levels.women')}:
                          <input type="number" step={sport === 'badminton' ? 1 : 0.05} min={0} max={sport === 'badminton' ? 6 : 8} className="input !w-24 !py-1.5 text-sm" placeholder="—" aria-label={`${t('levels.women')} ${t('cpanel.rangeFromAria', { name: it.label })}`} value={it.f_min ?? ''} onChange={(e) => setItem(i, { f_min: e.target.value })} />
                          {t('cpanel.rangeTo')}
                          <input type="number" step={sport === 'badminton' ? 1 : 0.05} min={0} max={sport === 'badminton' ? 6 : 8} className="input !w-24 !py-1.5 text-sm" placeholder="—" aria-label={`${t('levels.women')} ${t('cpanel.rangeToAria', { name: it.label })}`} value={it.f_max ?? ''} onChange={(e) => setItem(i, { f_max: e.target.value })} />
                        </span>
                      )}
                      {mode === 'score' && (
                        <label className="flex items-center gap-1.5 text-xs text-gray-400">
                          {t(sport === 'badminton' ? 'cpanel.fromStep' : 'cpanel.fromScore')}
                          <input type="number" step={sport === 'badminton' ? 1 : 0.05} min={0} max={sport === 'badminton' ? 6 : 8} className="input !w-28 !py-1.5 text-sm" placeholder={i === 0 ? t('cpanel.lowest') : ''} value={it.min ?? ''} onChange={(e) => setItem(i, { min: e.target.value === '' ? null : e.target.value })} />
                          <span className="text-gray-500">{items[i + 1]?.min != null && items[i + 1]?.min !== '' ? t('cpanel.toNext', { n: items[i + 1].min }) : t('cpanel.andUp')}</span>
                        </label>
                      )}
                      {mode === 'score' && s.levels?.by_gender && i > 0 && (
                        <label className="flex items-center gap-1.5 text-xs text-pink-200">
                          {t('cpanel.womenFrom')}
                          <input type="number" step={sport === 'badminton' ? 1 : 0.05} min={0} max={sport === 'badminton' ? 6 : 8} className="input !w-28 !py-1.5 text-sm" placeholder={it.min ?? ''} value={it.f_min ?? ''} onChange={(e) => setItem(i, { f_min: e.target.value === '' ? null : e.target.value })} />
                        </label>
                      )}
                      {mode === 'experience' && (
                        <span className="flex flex-wrap gap-1.5">
                          {DURATIONS.map((d) => {
                            const on = (it.buckets || []).includes(d);
                            const taken = !on && usedBuckets(i).has(d);
                            return (
                              <button key={d} type="button" disabled={taken} onClick={() => setItem(i, { buckets: on ? it.buckets.filter((b) => b !== d) : [...(it.buckets || []), d] })} className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? 'border-lime-400 bg-lime-400/15 text-lime-200' : 'border-navy-600 text-gray-400'} disabled:opacity-30`}>
                                {t(`memberX.dur_${d}`)}
                              </button>
                            );
                          })}
                        </span>
                      )}
                      <button type="button" className="ml-auto text-xs text-red-300" aria-label={t('cpanel.removeLevel')} onClick={() => setLevels({ items: items.filter((_, k) => k !== i) })}>✕</button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary !py-1.5 text-xs" disabled={items.length >= 12} onClick={() => setLevels({ items: [...items, { label: '', ...(mode === 'experience' ? { buckets: [] } : {}), ...(mode === 'score' ? { min: '' } : {}), ...(mode === 'manual' ? { dupr_min: '', dupr_max: '' } : {}) }] })}>＋ {t('cpanel.addLevel')}</button>
                    <button type="button" className="text-xs text-gray-400 underline" onClick={() => setLevels({ items: preset(mode, sport, t) })}>{t('cpanel.usePreset')}</button>
                  </div>
                  <p className="text-xs text-gray-500">{t(`cpanel.howUsed_${mode}`)}</p>
                </div>
              )}
            </Row>

            <Row title={t('cpanel.rankTitle')} hint={t('cpanel.rankHint')} wide>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('cpanel.rankTitle')}>
                {['none', 'levels', 'dupr'].map((m) => {
                  const off = m === 'levels' && mode === 'none';
                  return (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={rk.split === m}
                      disabled={off}
                      onClick={() => setRank({ split: m, groups: m === 'dupr' ? (rkGroups.length ? rkGroups : RANK_PRESET) : [] })}
                      className={`rounded-xl border p-3 text-left text-sm transition disabled:opacity-40 ${rk.split === m ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}
                    >
                      <span className="font-semibold">{t(`cpanel.rank_${m}`)}</span>
                      <span className="block text-xs text-gray-400 mt-0.5">{off ? t('cpanel.rankLevelsNeed') : t(`cpanel.rankHint_${m}`)}</span>
                    </button>
                  );
                })}
              </div>
              {rk.split === 'dupr' && (
                <div className="mt-4 flex flex-col gap-2">
                  {rkGroups.map((g, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-navy-900 px-3 py-2">
                      <span className="w-6 text-xs text-gray-500 tabular-nums">{i + 1}.</span>
                      <input className="input !w-40 !py-1.5 text-sm" maxLength={30} placeholder={t('cpanel.rankGroupName')} aria-label={t('cpanel.rankGroupName')} value={g.label} onChange={(e) => setGroup(i, { label: e.target.value })} />
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                        {t(sport === 'badminton' ? 'cpanel.rangeStep' : 'cpanel.rangeDupr')}
                        <input type="number" step={step} min={0} max={top} className="input !w-24 !py-1.5 text-sm" placeholder="—" aria-label={t('cpanel.rangeFromAria', { name: g.label })} value={g.min ?? ''} onChange={(e) => setGroup(i, { min: e.target.value })} />
                        {t('cpanel.rangeTo')}
                        <input type="number" step={step} min={0} max={top} className="input !w-24 !py-1.5 text-sm" placeholder="—" aria-label={t('cpanel.rangeToAria', { name: g.label })} value={g.max ?? ''} onChange={(e) => setGroup(i, { max: e.target.value })} />
                      </span>
                      <button type="button" className="ml-auto w-11 h-11 sm:w-8 sm:h-8 inline-flex items-center justify-center rounded-lg text-red-300 hover:bg-red-500/10" aria-label={t('cpanel.removeLevel')} onClick={() => setRank({ groups: rkGroups.filter((_, k) => k !== i) })}><UiIcon name="x" className="w-4 h-4" /></button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary !py-1.5 text-xs" disabled={rkGroups.length >= 12} onClick={() => setRank({ groups: [...rkGroups, { label: '', min: '', max: '' }] })}>＋ {t('cpanel.rankAdd')}</button>
                    <button type="button" className="text-xs text-gray-400 underline" onClick={() => setRank({ groups: RANK_PRESET })}>{t('cpanel.usePreset')}</button>
                  </div>
                  <p className="text-xs text-gray-500">{t('cpanel.rankDuprHow')}</p>
                </div>
              )}
              <div className="mt-4 rounded-lg border border-dashed border-navy-600 px-3 py-2">
                <p className="text-xs text-gray-400 mb-1.5">{t('cpanel.rankPreview')}</p>
                <ChipRow gap="gap-1.5">
                  {tabs.map((x, i) => (
                    <span key={i} className={`rounded-full border px-3 py-1 text-xs ${i === 0 ? 'border-lime-400 bg-lime-400/15 text-lime-200' : 'border-navy-600 text-gray-300'}`}>{x}</span>
                  ))}
                </ChipRow>
              </div>
            </Row>
          </Section>

          {/* One save for the page, pinned at the bottom: status on the left, Save on the right. */}
          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-navy-600 bg-navy-900/95 px-4 py-3 shadow-2xl">
            {msg && !msg.ok ? (
              <span className="text-sm text-red-300" role="alert">{msg.text}</span>
            ) : dirty ? (
              <span className="text-sm text-amber-200" role="status">{t('cpanel.unsaved')}</span>
            ) : msg ? (
              <span className="text-sm text-lime-300" role="status">✓ {msg.text}</span>
            ) : (
              <Link href="/club/members" className="text-sm text-gray-300 underline min-h-[44px] sm:min-h-0 inline-flex items-center">{t('cpanel.toMembers')}</Link>
            )}
            {!canEdit && <span className="text-sm text-gray-400">{t('cpanel.readOnly')}</span>}
            <button type="button" className="btn-primary ml-auto" disabled={!dirty && !busy} onClick={save}>{busy ? t('common.loading') : t('cpanel.save')}</button>
          </div>
        </fieldset>
      </div>
    </AppShell>
  );
}
