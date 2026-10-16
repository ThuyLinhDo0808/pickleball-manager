'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const fmtRating = (v) => (v == null ? 'NR' : Number(v).toFixed(3));
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');
const STATUS_TONE = {
  linked: 'border-lime-400/60 text-lime-300',
  not_in_club: 'border-amber-300/60 text-amber-200',
  conflict: 'border-red-400/60 text-red-300',
  none: 'border-navy-500 text-gray-400',
  manual: 'border-sky-400/60 text-sky-300',
};
const FILTERS = ['all', 'linked', 'manual', 'not_in_club', 'none', 'conflict'];

export function Change({ v, className = '' }) {
  if (v == null || v === 0) return null;
  const up = v > 0;
  return (
    <span className={`text-[11px] tabular-nums ${up ? 'text-lime-300' : 'text-red-300'} ${className}`}>
      {up ? '▲' : '▼'} {Math.abs(v).toFixed(3)}
    </span>
  );
}

// Members page → DUPR tab (pickleball): every member's DUPR ID and ratings, and the import of
// the DUPR Club member list. Linking is automatic and by DUPR ID only: the ID a player typed in
// their profile (or the Host typed here) is matched against the club's DUPR list.
export default function DuprMembers({ club }) {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get(`/api/clubs/${club.id}/dupr/members`), [club.id]);
  const { data: info, reload: reloadInfo } = useLoad(() => api.get(`/api/clubs/${club.id}/dupr`).catch(() => null), [club.id]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState(null); // { id, value }
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [showFree, setShowFree] = useState(false);
  const [score, setScore] = useState(null); // { id, doubles, rel, singles } typed by hand

  if (error?.payload?.code === 'not_pickleball') return <p className="card text-gray-300 text-sm">{t('dupr.onlyPickleball')}</p>;
  if (error) return <p className="card text-red-300 text-sm">{error.payload?.code === 'migration_required' ? t('dupr.needMigration') : error.message}</p>;
  if (!data) return <p className="text-gray-400 text-sm">{t('common.loading')}</p>;

  const members = data.members;
  // Same name twice: probably one person with two records (e.g. added by hand + signed up).
  const counts = members.reduce((c, m) => ({ ...c, [m.status]: (c[m.status] || 0) + 1 }), {});
  const q = query.trim().toLowerCase();
  const list = members
    .filter((m) => filter === 'all' || m.status === filter)
    .filter((m) => !q || m.full_name.toLowerCase().includes(q) || String(m.dupr_id || '').toLowerCase().includes(q) || String(m.dupr_name || '').toLowerCase().includes(q))
    .sort((a, b) => (b.doubles ?? -1) - (a.doubles ?? -1) || a.full_name.localeCompare(b.full_name));

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr('');
    setResult(null);
    setBusy(true);
    try {
      const r = await api.post(`/api/clubs/${club.id}/dupr/import`, { csv: await f.text() });
      setResult({ ...r, file: f.name });
      await Promise.all([reload(), reloadInfo()]);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };
  const saveId = async () => {
    setErr('');
    try {
      await api.patch(`/api/clubs/${club.id}/members/${edit.id}/dupr`, { dupr_id: edit.value });
      setEdit(null);
      await Promise.all([reload(), reloadInfo()]);
    } catch (e) {
      setErr(e.message);
    }
  };

  const saveScore = async () => {
    setErr('');
    try {
      await api.patch(`/api/clubs/${club.id}/members/${score.id}/dupr-score`, { doubles: score.doubles, doubles_rel: score.rel, singles: score.singles });
      setScore(null);
      await reload();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Update from DUPR: the round trip, step by step */}
      <section className="card">
        <h2 className="text-white font-semibold">{t('duprm.importTitle')}</h2>
        <p className="text-gray-400 text-sm mt-1">{t('duprm.flowIntro')}</p>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className={`rounded-xl border p-3 ${n === 4 ? 'border-lime-400/50 bg-lime-400/5' : 'border-navy-600 bg-navy-900/50'}`}>
              <p className="text-xs font-bold text-lime-300">{t('duprm.stepN', { n })} · {t(`duprm.step${n}Where`)}</p>
              <p className="text-white text-sm font-semibold mt-1">{t(`duprm.step${n}Title`)}</p>
              <p className="text-gray-400 text-xs mt-1">{t(`duprm.step${n}Body`)}</p>
              {n === 4 && (
                <label className={`btn-primary text-sm cursor-pointer inline-block mt-2 ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
                  📂 {busy ? t('common.loading') : t('duprm.chooseFile')}
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={pick} />
                </label>
              )}
            </li>
          ))}
        </ol>
        <p className="text-gray-500 text-xs mt-2">{t('duprm.lastImport', { date: fmtDate(data.last_import?.created_at), n: data.roster_size })}</p>
        <p className="text-sky-200 text-xs mt-2 rounded-lg border border-sky-400/30 bg-sky-400/5 px-2.5 py-2">💡 {t('duprm.manualTip')}</p>
        {err && <p className="text-red-400 text-sm mt-2">{err}</p>}
        {result && <ImportResult r={result} />}
        <ClubIdField club={club} value={info?.dupr_club_id} onSaved={reloadInfo} />
      </section>

      {/* Members with their DUPR */}
      <section className="card !p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-navy-700 bg-navy-900/40">
          <input className="input sm:!w-56 text-sm" type="search" placeholder={t('memx.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('memx.search')} />
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.filter((f) => f !== 'conflict' || counts.conflict).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={`text-xs rounded-full border px-3 py-1 ${filter === f ? 'border-lime-400 bg-lime-400/10 text-lime-300' : 'border-navy-600 text-gray-300'}`}>
                {t(`duprm.filter_${f}`)} <span className="tabular-nums">{f === 'all' ? members.length : counts[f] || 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs text-left border-b border-navy-700">
                <th className="py-2 px-3">{t('dupr.col_member')}</th>
                <th className="py-2 pr-3">{t('dupr.col_id')}</th>
                <th className="py-2 pr-3">{t('dupr.col_duprName')}</th>
                <th className="py-2 pr-3 text-right">{t('dupr.col_doubles')}</th>
                <th className="py-2 pr-3 text-right">{t('dupr.col_singles')}</th>
                <th className="py-2 pr-3">{t('dupr.col_status')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className={`border-b border-navy-800 last:border-0 ${m.is_active ? '' : 'opacity-50'}`}>
                  <td className="py-2 px-3 text-white">
                    {m.full_name}
                  </td>
                  <td className="py-2 pr-3">
                    {edit?.id === m.id ? (
                      <span className="flex items-center gap-1">
                        <input className="input !py-1 !w-28 uppercase font-mono" autoFocus maxLength={10} value={edit.value} aria-label={t('dupr.col_id')} onChange={(e) => setEdit({ ...edit, value: e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase() })} onKeyDown={(e) => e.key === 'Enter' && saveId()} />
                        <button type="button" className="text-lime-300 text-xs" onClick={saveId}>{t('common.save')}</button>
                        <button type="button" className="text-gray-400 text-xs" onClick={() => setEdit(null)} aria-label={t('common.cancel')}>✕</button>
                      </span>
                    ) : (
                      <button type="button" className="font-mono text-gray-200 hover:underline text-left" onClick={() => setEdit({ id: m.id, value: m.dupr_id || '' })}>
                        {m.dupr_id || <span className="text-gray-500 font-sans">+ {t('dupr.addId')}</span>}
                        {m.from_profile && <span className="block font-sans text-[11px] text-gray-500">{t('dupr.fromProfile')}</span>}
                      </button>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="text-gray-300">{m.dupr_name || '—'}</span>
                    {m.name_fits === false && <span className="block text-[11px] text-amber-200" title={t('duprm.nameDiffHint')}>⚠ {t('dupr.nameMismatch')}</span>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {score?.id === m.id ? (
                      <span className="flex flex-wrap items-center justify-end gap-1">
                        <input className="input !py-1 !w-20 text-right" type="number" step="0.001" min="1" max="8" autoFocus placeholder={t('dupr.col_doubles')} aria-label={t('dupr.col_doubles')} value={score.doubles} onChange={(e) => setScore({ ...score, doubles: e.target.value })} />
                        <input className="input !py-1 !w-16 text-right" type="number" step="1" min="0" max="100" placeholder="%" aria-label={t('duprm.relLabel')} value={score.rel} onChange={(e) => setScore({ ...score, rel: e.target.value })} />
                        <input className="input !py-1 !w-20 text-right" type="number" step="0.001" min="1" max="8" placeholder={t('dupr.col_singles')} aria-label={t('dupr.col_singles')} value={score.singles} onChange={(e) => setScore({ ...score, singles: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveScore()} />
                        <button type="button" className="text-lime-300 text-xs" onClick={saveScore}>{t('common.save')}</button>
                        <button type="button" className="text-gray-400 text-xs" onClick={() => setScore(null)} aria-label={t('common.cancel')}>✕</button>
                      </span>
                    ) : m.status === 'linked' ? (
                      <>
                        <span className="text-white font-semibold">{fmtRating(m.doubles)}</span>
                        <span className="block leading-tight">
                          <Change v={m.change} />
                          {m.doubles_rel != null && <span className="text-[11px] text-gray-500 ml-1">{t('dupr.rel', { n: m.doubles_rel })}</span>}
                        </span>
                      </>
                    ) : (
                      <button type="button" className="text-right hover:underline" title={t('duprm.typeScoreHint')} onClick={() => setScore({ id: m.id, doubles: m.doubles ?? '', rel: m.doubles_rel ?? '', singles: m.singles ?? '' })}>
                        {m.status === 'manual' ? (
                          <>
                            <span className="text-white font-semibold">{fmtRating(m.doubles)}</span>
                            {m.doubles_rel != null && <span className="block text-[11px] text-gray-500">{t('dupr.rel', { n: m.doubles_rel })}</span>}
                          </>
                        ) : (
                          <span className="text-gray-500 text-xs">
                            + {t('duprm.typeScore')}
                            {m.self_level != null && <span className="block text-[11px] text-gray-600">{t('duprm.selfLevel', { v: m.self_level })}</span>}
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-300">{['linked', 'manual'].includes(m.status) && m.singles != null ? fmtRating(m.singles) : '—'}</td>
                  <td className="py-2 pr-3">
                    <span className={`text-[11px] rounded border px-1.5 py-0.5 whitespace-nowrap ${STATUS_TONE[m.status]}`}>{t(`duprm.status_${m.status}`)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && <p className="text-gray-500 text-sm p-4">{t('memx.noMatch')}</p>}
        <p className="text-gray-500 text-xs px-3 py-2 border-t border-navy-700">{t('duprm.statusHint')}</p>
      </section>

      {/* On DUPR, nobody in the club yet */}
      {data.unclaimed.length > 0 && (
        <section className="card">
          <button type="button" className="w-full flex items-center justify-between gap-2 text-left" onClick={() => setShowFree((v) => !v)} aria-expanded={showFree}>
            <span>
              <span className="text-white font-semibold">{t('duprm.freeTitle', { n: data.unclaimed.length })}</span>
              <span className="block text-gray-400 text-xs mt-0.5">{t('duprm.freeHint')}</span>
            </span>
            <span className="text-gray-400 text-sm" aria-hidden="true">{showFree ? '▲' : '▼'}</span>
          </button>
          {showFree && (
            <ul className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 divide-y sm:divide-y-0 divide-navy-800 text-sm max-h-96 overflow-y-auto">
              {data.unclaimed.map((r) => (
                <li key={r.dupr_id} className="py-1.5 flex items-center gap-2">
                  <span className="text-gray-200 truncate">{r.name || '—'}</span>
                  <span className="font-mono text-gray-500 text-xs">{r.dupr_id}</span>
                  <span className="ml-auto text-gray-400 text-xs tabular-nums">{fmtRating(r.doubles)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function ImportResult({ r }) {
  const { t } = useI18n();
  return (
    <div className="mt-3 rounded-xl border border-lime-400/40 bg-lime-400/5 p-3 text-sm">
      <p className="text-lime-300 font-semibold">✓ {t('duprm.done', { file: r.file })}</p>
      <ul className="mt-1.5 grid sm:grid-cols-2 gap-x-6 gap-y-0.5 text-gray-200">
        <li>{t('duprm.rRows', { n: r.rows })}{r.duplicates > 0 && <span className="text-gray-400"> · {t('duprm.rDup', { n: r.duplicates })}</span>}</li>
        <li>{t('duprm.rIds', { fresh: r.new_ids, known: r.known_ids })}</li>
        <li>{t('duprm.rLinked', { n: r.linked_new.length })}{r.linked_new.length > 0 && <span className="text-gray-400">: {r.linked_new.map((x) => x.full_name).join(', ')}</span>}</li>
        <li>{t('duprm.rUpdated', { n: r.updated, same: r.unchanged })}</li>
      </ul>
      {r.linked_new.some((x) => !x.name_fits) && <p className="text-amber-200 text-xs mt-2">⚠ {t('duprm.rNameCheck', { names: r.linked_new.filter((x) => !x.name_fits).map((x) => `${x.full_name} ↔ ${x.dupr_name}`).join(' · ') })}</p>}
      {r.conflicts.length > 0 && <p className="text-red-300 text-xs mt-2">⚠ {t('duprm.rConflict', { list: r.conflicts.map((c) => `${c.dupr_id}: ${c.names.join(', ')}`).join(' · ') })}</p>}
      {r.not_in_club.length > 0 && <p className="text-gray-400 text-xs mt-2">{t('duprm.rNotIn', { names: r.not_in_club.map((x) => x.full_name).join(', ') })}</p>}
    </div>
  );
}

function ClubIdField({ club, value, onSaved }) {
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
    <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-navy-700">
      <label className="text-gray-400 text-xs" htmlFor="dupr-club">{t('dupr.clubId')}</label>
      <input id="dupr-club" className="input !py-1 !w-48 text-sm" value={v} disabled={!canEdit} placeholder={t('dupr.clubIdPh')} onChange={(e) => setV(e.target.value)} />
      {canEdit && v !== (value || '') && <button type="button" className="btn-primary !py-1 text-sm" disabled={busy} onClick={save}>{t('common.save')}</button>}
    </div>
  );
}
