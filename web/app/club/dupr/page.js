'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const fmtDay = (d) => (d ? d.split('-').reverse().join('/') : '—');
const fmtRating = (v) => (v == null ? 'NR' : Number(v).toFixed(3));
const todayYmd = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const TABS = ['members', 'import', 'matches'];

// DUPR without the partner API (pickleball): members' DUPR IDs and ratings, importing the
// DUPR Club member list, and exporting matches in DUPR's "Import Matches via CSV" template.
export default function DuprPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const [tab, setTab] = useState('members');
  const { data: info, error, reload } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/dupr`) : Promise.resolve(null)), [club?.id]);
  const notPickleball = error?.payload?.code === 'not_pickleball' || (club?.sport && club.sport !== 'pickleball');

  return (
    <AppShell>
      <PageHeader icon="📈" title={t('dupr.title')} subtitle={club?.name} />
      <SectionTabs group="stats" />
      {notPickleball ? (
        <p className="card text-gray-300 text-sm">{t('dupr.onlyPickleball')}</p>
      ) : error ? (
        <p className="card text-red-300 text-sm">{error.payload?.code === 'migration_required' ? t('dupr.needMigration') : error.message}</p>
      ) : (
        <>
          {info && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <div className="card !py-3">
                <p className="text-gray-400 text-xs">{t('dupr.statLinked')}</p>
                <p className="text-white text-2xl font-bold">{info.linked}<span className="text-gray-500 text-base font-normal">/{info.members}</span></p>
              </div>
              <div className="card !py-3">
                <p className="text-gray-400 text-xs">{t('dupr.statSync')}</p>
                <p className="text-white text-lg font-semibold">{info.last_sync ? new Date(info.last_sync).toLocaleDateString('vi-VN') : '—'}</p>
              </div>
              <ClubIdCard club={club} value={info.dupr_club_id} onSaved={reload} />
            </div>
          )}
          <div className="flex gap-1 border-b border-navy-700 mb-4 overflow-x-auto no-scrollbar">
            {TABS.map((k) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm whitespace-nowrap ${tab === k ? 'border-lime-400 text-lime-300 font-semibold' : 'border-transparent text-gray-400 hover:text-white'}`}>
                {t(`dupr.tab_${k}`)}
              </button>
            ))}
          </div>
          {club && tab === 'members' && <MembersTab club={club} onChanged={reload} />}
          {club && tab === 'import' && <ImportTab club={club} onDone={() => { reload(); setTab('members'); }} />}
          {club && tab === 'matches' && <MatchesTab club={club} />}
        </>
      )}
    </AppShell>
  );
}

function ClubIdCard({ club, value, onSaved }) {
  const { t } = useI18n();
  const [v, setV] = useState(value || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(value || ''), [value]);
  const canEdit = !club?.role || ['owner', 'co_admin'].includes(club.role);
  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/api/clubs/${club.id}/dupr`, { dupr_club_id: v });
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card !py-3 col-span-2 sm:col-span-1">
      <label className="text-gray-400 text-xs" htmlFor="dupr-club">{t('dupr.clubId')}</label>
      <div className="flex gap-2 mt-1">
        <input id="dupr-club" className="input !py-1.5" value={v} disabled={!canEdit} placeholder={t('dupr.clubIdPh')} onChange={(e) => setV(e.target.value)} />
        {canEdit && v !== (value || '') && <button type="button" className="btn-primary !py-1 text-sm" disabled={busy} onClick={save}>{t('common.save')}</button>}
      </div>
    </div>
  );
}

// ---- members ---------------------------------------------------------------------------
function statusOf(m) {
  if (m.dupr_id && m.dupr_verified_at) return 'linked';
  if (m.dupr_id) return 'pending';
  return 'none';
}
const STATUS_TONE = { linked: 'border-lime-400/60 text-lime-300', pending: 'border-amber-300/60 text-amber-200', none: 'border-navy-500 text-gray-400' };

function MembersTab({ club, onChanged }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState('all');
  const [edit, setEdit] = useState(null); // { id, value }
  const [err, setErr] = useState('');
  const { data: members, reload } = useLoad(() => api.get(`/api/clubs/${club.id}/members`), [club.id]);
  const list = (members || []).filter((m) => filter === 'all' || statusOf(m) === filter);
  const counts = (members || []).reduce((c, m) => ({ ...c, [statusOf(m)]: (c[statusOf(m)] || 0) + 1 }), {});

  const saveId = async () => {
    setErr('');
    try {
      await api.patch(`/api/clubs/${club.id}/members/${edit.id}/dupr`, { dupr_id: edit.value });
      setEdit(null);
      reload();
      onChanged();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <section className="card">
      <p className="text-gray-400 text-sm mb-3">{t('dupr.membersHint')}</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {['all', 'linked', 'pending', 'none'].map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`text-xs rounded-full border px-3 py-1 ${filter === f ? 'border-lime-400 bg-lime-400/10 text-lime-300' : 'border-navy-600 text-gray-300'}`}>
            {t(`dupr.filter_${f}`)} {f === 'all' ? (members || []).length : counts[f] || 0}
          </button>
        ))}
      </div>
      {err && <p className="text-red-400 text-sm mb-2">{err}</p>}
      <div className="table-wrap">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs text-left border-b border-navy-700">
              <th className="py-2 pr-2">{t('dupr.col_member')}</th>
              <th className="py-2 pr-2">{t('dupr.col_id')}</th>
              <th className="py-2 pr-2">{t('dupr.col_duprName')}</th>
              <th className="py-2 pr-2 text-right">{t('dupr.col_doubles')}</th>
              <th className="py-2 pr-2 text-right">{t('dupr.col_singles')}</th>
              <th className="py-2">{t('dupr.col_status')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((m) => {
              const st = statusOf(m);
              return (
                <tr key={m.id} className="border-b border-navy-800">
                  <td className="py-2 pr-2 text-white">{m.full_name}</td>
                  <td className="py-2 pr-2">
                    {edit?.id === m.id ? (
                      <span className="flex gap-1">
                        <input className="input !py-1 !w-28 uppercase" autoFocus maxLength={10} value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase() })} onKeyDown={(e) => e.key === 'Enter' && saveId()} />
                        <button type="button" className="text-lime-300 text-xs" onClick={saveId}>{t('common.save')}</button>
                        <button type="button" className="text-gray-400 text-xs" onClick={() => setEdit(null)}>✕</button>
                      </span>
                    ) : (
                      <button type="button" className="font-mono text-gray-200 hover:underline" onClick={() => setEdit({ id: m.id, value: m.dupr_id || '' })}>
                        {m.dupr_id || <span className="text-gray-500 font-sans">+ {t('dupr.addId')}</span>}
                      </button>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-gray-300">{m.dupr_name || '—'}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {m.dupr_synced_at ? <span className="text-white">{fmtRating(m.dupr_doubles)}</span> : '—'}
                    {m.dupr_doubles_rel != null && m.dupr_synced_at && <span className="block text-[11px] text-gray-500">{t('dupr.rel', { n: m.dupr_doubles_rel })}</span>}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-gray-300">{m.dupr_synced_at ? fmtRating(m.dupr_singles) : '—'}</td>
                  <td className="py-2">
                    <span className={`text-[11px] rounded border px-1.5 py-0.5 whitespace-nowrap ${STATUS_TONE[st]}`}>{t(`dupr.status_${st}`)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!list.length && <p className="text-gray-500 text-sm mt-2">—</p>}
    </section>
  );
}

// ---- import the DUPR Club member list ------------------------------------------------
function ImportTab({ club, onDone }) {
  const { t } = useI18n();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [pv, setPv] = useState(null);
  const [keep, setKeep] = useState({}); // member_id -> bool (matched rows)
  const [pair, setPair] = useState({}); // dupr_id -> member_id (file rows not linked yet)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  const pick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr('');
    setDone(null);
    setFileName(f.name);
    const text = await f.text();
    setCsv(text);
    setBusy(true);
    try {
      const r = await api.post(`/api/clubs/${club.id}/dupr/preview`, { csv: text });
      setPv(r);
      setKeep(Object.fromEntries(r.matched.map((m) => [m.member_id, !m.duplicate && (m.verified || m.name_fits)])));
      setPair({});
    } catch (e2) {
      setErr(e2.message);
      setPv(null);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const links = pv
    ? [
        ...pv.matched.filter((m) => keep[m.member_id]).map((m) => ({ member_id: m.member_id, dupr_id: m.dupr_id })),
        ...Object.entries(pair).filter(([, mid]) => mid).map(([dupr_id, member_id]) => ({ member_id, dupr_id })),
      ]
    : [];
  const pickedMembers = new Set(Object.values(pair).filter(Boolean));

  const apply = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api.post(`/api/clubs/${club.id}/dupr/apply`, { csv, links });
      setDone(r);
      setPv(null);
      setCsv('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <h2 className="text-white font-semibold">{t('dupr.importTitle')}</h2>
        <ol className="text-gray-300 text-sm list-decimal pl-5 mt-2 space-y-1">
          <li>{t('dupr.importStep1')}</li>
          <li>{t('dupr.importStep2')}</li>
          <li>{t('dupr.importStep3')}</li>
        </ol>
        <label className="btn-primary inline-block mt-3 cursor-pointer">
          📂 {busy && !pv ? t('common.loading') : t('dupr.chooseFile')}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={pick} />
        </label>
        {fileName && <span className="ml-2 text-gray-400 text-xs">{fileName}</span>}
        {err && <p className="text-red-400 text-sm mt-2">{err}</p>}
        {done && (
          <p className="text-lime-300 text-sm mt-3">
            ✓ {t('dupr.importDone', { n: done.linked, l: done.levels_changed })}{' '}
            <button type="button" className="underline" onClick={onDone}>{t('dupr.seeMembers')}</button>
          </p>
        )}
      </section>

      {pv && (
        <>
          <section className="card">
            <h3 className="text-white font-semibold">{t('dupr.matchedTitle', { n: pv.matched.length, total: pv.total })}</h3>
            <p className="text-gray-400 text-xs mb-2">{t('dupr.matchedHint')}</p>
            {pv.matched.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('dupr.matchedNone')}</p>
            ) : (
              <div className="table-wrap">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs text-left border-b border-navy-700">
                      <th className="py-2 w-8" />
                      <th className="py-2 pr-2">{t('dupr.col_member')}</th>
                      <th className="py-2 pr-2">{t('dupr.col_id')}</th>
                      <th className="py-2 pr-2">{t('dupr.col_duprName')}</th>
                      <th className="py-2 text-right">{t('dupr.col_doubles')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pv.matched.map((m) => (
                      <tr key={m.member_id} className={`border-b border-navy-800 ${!m.name_fits || m.duplicate ? 'bg-amber-300/5' : ''}`}>
                        <td className="py-2">
                          <input type="checkbox" aria-label={m.full_name} checked={!!keep[m.member_id]} disabled={m.duplicate} onChange={(e) => setKeep({ ...keep, [m.member_id]: e.target.checked })} />
                        </td>
                        <td className="py-2 pr-2 text-white">
                          {m.full_name}
                          {m.from_profile && <span className="block text-[11px] text-gray-500">{t('dupr.fromProfile')}</span>}
                        </td>
                        <td className="py-2 pr-2 font-mono text-gray-200">{m.dupr_id}</td>
                        <td className="py-2 pr-2">
                          <span className="text-gray-200">{m.dupr_name}</span>
                          {m.duplicate ? (
                            <span className="block text-[11px] text-red-300">⚠ {t('dupr.duplicate')}</span>
                          ) : !m.name_fits ? (
                            <span className="block text-[11px] text-amber-200">⚠ {t('dupr.nameMismatch')}</span>
                          ) : m.verified ? (
                            <span className="block text-[11px] text-lime-300">✓ {t('dupr.status_linked')}</span>
                          ) : null}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {m.old_doubles != null && Number(m.old_doubles) !== m.doubles && <span className="text-gray-500 line-through mr-1">{fmtRating(m.old_doubles)}</span>}
                          <span className="text-white">{fmtRating(m.doubles)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {pv.unlinked.length > 0 && (
            <section className="card">
              <h3 className="text-white font-semibold">{t('dupr.unlinkedTitle', { n: pv.unlinked.length })}</h3>
              <p className="text-gray-400 text-xs mb-2">{t('dupr.unlinkedHint')}</p>
              <div className="flex flex-col divide-y divide-navy-800 max-h-[28rem] overflow-y-auto">
                {pv.unlinked.map((r) => {
                  const options = [...r.suggestions, ...pv.free_members.filter((m) => !r.suggestions.some((s) => s.member_id === m.member_id))];
                  return (
                    <div key={r.dupr_id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="text-white">{r.name}</span> <span className="font-mono text-gray-400 text-xs">{r.dupr_id}</span>
                        <span className="text-gray-500 text-xs"> · {fmtRating(r.doubles)}</span>
                      </span>
                      <select className="input !py-1 !w-56 text-sm" value={pair[r.dupr_id] || ''} onChange={(e) => setPair({ ...pair, [r.dupr_id]: e.target.value })}>
                        <option value="">{t('dupr.noPair')}</option>
                        {options.map((m) => (
                          <option key={m.member_id} value={m.member_id} disabled={pickedMembers.has(m.member_id) && pair[r.dupr_id] !== m.member_id}>
                            {r.suggestions.some((s) => s.member_id === m.member_id) ? '★ ' : ''}{m.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {pv.not_in_file.length > 0 && (
            <section className="card border-amber-300/40">
              <h3 className="text-amber-200 font-semibold">{t('dupr.notInFileTitle', { n: pv.not_in_file.length })}</h3>
              <p className="text-gray-400 text-xs mb-2">{t('dupr.notInFileHint')}</p>
              <p className="text-gray-200 text-sm">{pv.not_in_file.map((m) => `${m.full_name} (${m.dupr_id})`).join(' · ')}</p>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" disabled={busy || !links.length} onClick={apply}>{busy ? t('common.loading') : t('dupr.applyN', { n: links.length })}</button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setPv(null)}>{t('common.cancel')}</button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- export matches -----------------------------------------------------------------------
function MatchesTab({ club }) {
  const { t } = useI18n();
  const today = todayYmd();
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [all, setAll] = useState(false);
  const [scoreType, setScoreType] = useState('SIDEOUT');
  const [lastExport, setLastExport] = useState(null); // { items, count }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { data, reload } = useLoad(() => api.get(`/api/clubs/${club.id}/dupr/matches?from=${from}&to=${to}${all ? '&all=1' : ''}`), [club.id, from, to, all]);
  const list = data?.matches || [];
  const ready = list.filter((m) => m.ready && !m.exported_at);
  const missing = list.filter((m) => !m.ready && !m.no_score);

  const download = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api.post(`/api/clubs/${club.id}/dupr/matches/csv`, { from, to, score_type: scoreType, items: ready.map((m) => ({ kind: m.kind, id: m.id })) });
      const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `dupr-matches-${from}-${to}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      setLastExport({ items: r.items, count: r.count });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const mark = async (items, exported) => {
    setBusy(true);
    setErr('');
    try {
      await api.post(`/api/clubs/${club.id}/dupr/matches/mark`, { items, exported });
      if (exported) setLastExport(null);
      reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const team = (ps) => ps.map((p) => p.name).join(' / ');

  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <h2 className="text-white font-semibold">{t('dupr.exportTitle')}</h2>
        <ol className="text-gray-300 text-sm list-decimal pl-5 mt-2 space-y-1">
          <li>{t('dupr.exportStep1')}</li>
          <li>{t('dupr.exportStep2')}</li>
          <li>{t('dupr.exportStep3')}</li>
        </ol>
        <p className="text-gray-500 text-xs mt-2">{t('dupr.exportNote')}</p>
        <div className="flex flex-wrap items-end gap-3 mt-3">
          <label className="text-xs text-gray-400">
            {t('dupr.from')}
            <input type="date" className="input !py-1.5 mt-1" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs text-gray-400">
            {t('dupr.to')}
            <input type="date" className="input !py-1.5 mt-1" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="text-xs text-gray-400">
            {t('dupr.scoreType')}
            <select className="input !py-1.5 mt-1" value={scoreType} onChange={(e) => setScoreType(e.target.value)}>
              <option value="SIDEOUT">{t('dupr.sideout')}</option>
              <option value="RALLY">{t('dupr.rally')}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300 pb-2">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            {t('dupr.showExported')}
          </label>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" className="btn-primary" disabled={busy || !ready.length} onClick={download}>⬇ {t('dupr.downloadN', { n: ready.length })}</button>
          {lastExport && lastExport.count > 0 && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => mark(lastExport.items, true)}>✓ {t('dupr.markN', { n: lastExport.count })}</button>
          )}
        </div>
        {lastExport && lastExport.count > 0 && <p className="text-amber-200 text-xs mt-2">{t('dupr.markHint')}</p>}
        {err && <p className="text-red-400 text-sm mt-2">{err}</p>}
        {missing.length > 0 && <p className="text-amber-200 text-sm mt-3">⚠ {t('dupr.missingN', { n: missing.length })}</p>}
      </section>

      <section className="card">
        {list.length === 0 ? (
          <p className="text-gray-500 text-sm">{t('dupr.noMatches')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-navy-800">
            {list.map((m) => (
              <div key={`${m.kind}:${m.id}`} className="py-2.5 flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
                <span className="text-gray-400 text-xs w-20 shrink-0 pt-0.5">{fmtDay(m.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-white">{team(m.a)}</span> <span className="text-gray-500">vs</span> <span className="text-white">{team(m.b)}</span>
                  <span className="block text-gray-500 text-xs">
                    {m.event || '—'} · {m.type === 'S' ? t('dupr.singles') : t('dupr.doubles')}
                    {m.games.length > 0 && ` · ${m.games.map(([a, b]) => `${a}-${b}`).join(', ')}`}
                  </span>
                </span>
                <span className="text-xs shrink-0">
                  {m.exported_at ? (
                    <span className="text-gray-400">
                      ✓ {t('dupr.exportedOn', { date: new Date(m.exported_at).toLocaleDateString('vi-VN') })}{' '}
                      <button type="button" className="underline" disabled={busy} onClick={() => mark([{ kind: m.kind, id: m.id }], false)}>{t('dupr.unmark')}</button>
                    </span>
                  ) : m.ready ? (
                    <span className="text-lime-300">{t('dupr.ready')}</span>
                  ) : m.no_score ? (
                    <span className="text-gray-500">{t('dupr.noScore')}</span>
                  ) : (
                    <span className="text-amber-200">{t('dupr.missing', { names: m.missing.join(', ') })}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
