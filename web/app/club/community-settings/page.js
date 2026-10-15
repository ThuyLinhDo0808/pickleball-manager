'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const MODES = ['none', 'manual', 'score', 'experience'];
const DURATIONS = ['lt6', '6_12', '12_18', 'gt18'];

// Ready-made level sets the Host can start from (then rename / change).
function preset(mode, sport, t) {
  if (mode === 'manual') return ['A', 'B', 'C', 'D'].map((l) => ({ label: `Series ${l}` }));
  if (mode === 'score') {
    return sport === 'badminton'
      ? [{ label: t('cpanel.p_new'), min: null }, { label: t('cpanel.p_mid'), min: 3 }, { label: t('cpanel.p_good'), min: 5 }]
      : [{ label: t('cpanel.p_new'), min: null }, { label: t('cpanel.p_mid'), min: 3 }, { label: t('cpanel.p_good'), min: 3.5 }, { label: t('cpanel.p_strong'), min: 4 }];
  }
  if (mode === 'experience') return DURATIONS.map((d) => ({ label: t(`memberX.dur_${d}`), buckets: [d] }));
  return [];
}

function Card({ icon, title, hint, children }) {
  return (
    <section className="card mb-4">
      <h2 className="text-white font-semibold">{icon} {title}</h2>
      {hint && <p className="text-gray-400 text-xs mt-0.5">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Social Manager control panel: how members become regulars / drop-ins, when they count as
// inactive, and how the community splits players into levels (used by members, kèo, stats).
export default function CommunitySettingsPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const { data, error, reload } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/community-settings`) : Promise.resolve(null)), [club?.id]);
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const canEdit = !club?.role || ['owner', 'co_admin'].includes(club.role);
  const sport = data?.sport || club?.sport || 'pickleball';

  useEffect(() => {
    if (data?.settings) setS(JSON.parse(JSON.stringify(data.settings)));
  }, [data]);

  const set = (patch) => setS((x) => ({ ...x, ...patch }));
  const setLevels = (patch) => setS((x) => ({ ...x, levels: { ...x.levels, ...patch } }));
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

  const header = <PageHeader icon="🎛" title={t('cpanel.title')} subtitle={club?.name} />;
  if (error) return <AppShell>{header}<p className="card text-red-300 text-sm">{error.message}</p></AppShell>;
  if (!s) return <AppShell>{header}<p className="text-gray-400 text-sm">{t('common.loading')}</p></AppShell>;
  if (data && !data.ready) return <AppShell>{header}<p className="card text-amber-200 text-sm">{t('cpanel.err_migration_required')}</p></AppShell>;
  if (data?.kind !== 'community') return <AppShell>{header}<p className="card text-gray-300 text-sm">{t('cpanel.onlyCommunity')}</p></AppShell>;

  const mode = s.levels.mode;
  const items = s.levels.items;
  const usedBuckets = (i) => new Set(items.flatMap((it, k) => (k === i ? [] : it.buckets || [])));

  return (
    <AppShell>
      {header}
      <p className="text-gray-400 text-sm mb-4 -mt-2">{t('cpanel.intro')}</p>
      <fieldset disabled={!canEdit || busy} className="contents">
        <Card icon="🔁" title={t('cpanel.regularTitle')} hint={t('cpanel.regularHint')}>
          <label className="flex flex-wrap items-center gap-2 text-sm text-gray-200">
            {t('cpanel.regularFrom')}
            <input type="number" min={1} max={31} className="input !w-20 !py-1.5 text-center" value={s.regular.min} onChange={(e) => set({ regular: { ...s.regular, min: e.target.value } })} />
            {t('cpanel.regularUnit')}
          </label>
          <p className="mt-1 text-xs text-gray-500">{t('cpanel.dropinBelow', { n: s.regular.min || '?' })}</p>
          <label className="mt-4 flex items-start gap-3 text-sm text-gray-200 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={s.regular.auto} onChange={(e) => set({ regular: { ...s.regular, auto: e.target.checked } })} />
            <span>
              {t('cpanel.auto')}
              <span className="block text-xs text-gray-500">{t('cpanel.autoHint')}</span>
            </span>
          </label>
          <button type="button" className="btn-secondary text-sm mt-3" onClick={runNow}>↻ {t('cpanel.runNow')}</button>
        </Card>

        <Card icon="💤" title={t('cpanel.activeTitle')} hint={t('cpanel.activeHint')}>
          <label className="flex flex-wrap items-center gap-2 text-sm text-gray-200">
            {t('cpanel.inactiveAfter')}
            <input type="number" min={7} max={180} className="input !w-20 !py-1.5 text-center" value={s.active_days} onChange={(e) => set({ active_days: e.target.value })} />
            {t('cpanel.days')}
          </label>
        </Card>

        <Card icon="📶" title={t('cpanel.levelTitle')} hint={t('cpanel.levelHint')}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label={t('cpanel.levelTitle')}>
            {MODES.map((m) => (
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

          {mode !== 'none' && (
            <div className="mt-4 flex flex-col gap-2">
              {items.map((it, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-navy-900 px-3 py-2">
                  <span className="w-6 text-xs text-gray-500 tabular-nums">{i + 1}.</span>
                  <input className="input !w-44 !py-1.5 text-sm" maxLength={30} placeholder={t('cpanel.levelName')} aria-label={t('cpanel.levelName')} value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} />
                  {mode === 'score' && (
                    <label className="flex items-center gap-1.5 text-xs text-gray-400">
                      {t(sport === 'badminton' ? 'cpanel.fromStep' : 'cpanel.fromScore')}
                      <input type="number" step={sport === 'badminton' ? 1 : 0.05} min={0} max={sport === 'badminton' ? 6 : 8} className="input !w-28 !py-1.5 text-sm" placeholder={i === 0 ? t('cpanel.lowest') : ''} value={it.min ?? ''} onChange={(e) => setItem(i, { min: e.target.value === '' ? null : e.target.value })} />
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
                <button type="button" className="btn-secondary !py-1.5 text-xs" disabled={items.length >= 12} onClick={() => setLevels({ items: [...items, { label: '', ...(mode === 'experience' ? { buckets: [] } : {}), ...(mode === 'score' ? { min: '' } : {}) }] })}>＋ {t('cpanel.addLevel')}</button>
                <button type="button" className="text-xs text-gray-400 underline" onClick={() => setLevels({ items: preset(mode, sport, t) })}>{t('cpanel.usePreset')}</button>
              </div>
              <p className="text-xs text-gray-500">{t(`cpanel.howUsed_${mode}`)}</p>
            </div>
          )}
        </Card>

        <div className="h-2" aria-hidden="true" />
        <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-navy-600 bg-navy-900/95 px-4 py-3 backdrop-blur">
          <button type="button" className="btn-primary" onClick={save}>{busy ? t('common.loading') : t('cpanel.save')}</button>
          <Link href="/club/members" className="text-sm text-gray-300 underline">{t('cpanel.toMembers')}</Link>
          {msg && <span className={`text-sm ${msg.ok ? 'text-lime-300' : 'text-red-300'}`} role="status">{msg.ok ? '✓ ' : ''}{msg.text}</span>}
          {!canEdit && <span className="text-xs text-gray-400">{t('cpanel.readOnly')}</span>}
        </div>
      </fieldset>
    </AppShell>
  );
}
