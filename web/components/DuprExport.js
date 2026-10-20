'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { localDate } from '@/lib/dates';

// "Gửi trận lên DUPR" inside one event (kèo / session), one tournament, or the club's own
// matches: what can be sent, what is missing, the CSV in DUPR's "Import Matches via CSV"
// template, and marking the matches as uploaded. Pickleball clubs only — renders nothing when
// DUPR is not available here (badminton, migration not run, no permission).
// scope: { event } | { tournament } | { scope: 'club' }
export default function DuprExport({ clubId, scope, fileName = 'dupr-matches', reloadKey }) {
  const { t } = useI18n();
  const qs = new URLSearchParams({ ...scope, all: '1' }).toString();
  const { data, error, reload } = useLoad(() => (clubId ? api.get(`/api/clubs/${clubId}/dupr/matches?${qs}`) : Promise.resolve(null)), [clubId, qs, reloadKey]);
  const [scoreType, setScoreType] = useState('SIDEOUT');
  const [lastExport, setLastExport] = useState(null); // { items, count }
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!clubId || error || !data) return null;

  const list = data.matches || [];
  if (!list.length) return null;
  const sent = list.filter((m) => m.exported_at);
  const ready = list.filter((m) => m.ready && !m.exported_at);
  const blocked = list.filter((m) => !m.exported_at && !m.ready && !m.no_score);
  const noScore = list.filter((m) => !m.exported_at && m.no_score);
  const missingNames = [...new Set(blocked.flatMap((m) => m.missing))];
  const needsScoring = ready.some((m) => !m.scoring);

  const download = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api.post(`/api/clubs/${clubId}/dupr/matches/csv`, { ...scope, score_type: scoreType, items: ready.map((m) => ({ kind: m.kind, id: m.id })) });
      const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${fileName}.csv`;
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
      await api.post(`/api/clubs/${clubId}/dupr/matches/mark`, { items, exported });
      if (exported) setLastExport(null);
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const team = (ps) => ps.map((p) => p.name).join(' / ');
  const Count = ({ n, label, tone }) => (
    <span className="flex items-baseline gap-1">
      <span className={`text-lg font-bold tabular-nums ${tone}`}>{n}</span>
      <span className="text-xs text-gray-400">{label}</span>
    </span>
  );

  return (
    <section className="card mt-4" aria-labelledby="dupr-export-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="dupr-export-title" className="text-white font-semibold">📈 {t('duprx.title')}</h3>
          <p className="text-gray-400 text-xs mt-0.5">{t('duprx.hint')}</p>
        </div>
        <button type="button" className="text-xs text-gray-300 underline underline-offset-2" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? t('duprx.hideList') : t('duprx.showList', { n: list.length })}
        </button>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
        <Count n={ready.length} label={t('duprx.ready')} tone="text-lime-300" />
        <Count n={sent.length} label={t('duprx.sent')} tone="text-white" />
        <Count n={blocked.length} label={t('duprx.blocked')} tone={blocked.length ? 'text-amber-300' : 'text-gray-500'} />
        <Count n={noScore.length} label={t('duprx.noScore')} tone="text-gray-500" />
      </div>
      {missingNames.length > 0 && <p className="text-amber-200 text-xs mt-2">⚠ {t('duprx.missing', { names: missingNames.join(', ') })}</p>}

      <div className="flex flex-wrap items-end gap-2 mt-3">
        {needsScoring && ready.length > 0 && (
          <label className="text-xs text-gray-400">
            {t('dupr.scoreType')}
            <select className="input !py-1.5 mt-1 !w-auto" value={scoreType} onChange={(e) => setScoreType(e.target.value)}>
              <option value="SIDEOUT">{t('dupr.sideout')}</option>
              <option value="RALLY">{t('dupr.rally')}</option>
            </select>
          </label>
        )}
        <button type="button" className="btn-primary text-sm" disabled={busy || !ready.length} onClick={download}>⬇ {t('dupr.downloadN', { n: ready.length })}</button>
        {lastExport?.count > 0 && (
          <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => mark(lastExport.items, true)}>✓ {t('dupr.markN', { n: lastExport.count })}</button>
        )}
      </div>
      {lastExport?.count > 0 && <p className="text-gray-400 text-xs mt-2">{t('duprx.uploadHow')}</p>}
      {err && <p className="text-red-400 text-sm mt-2">{err}</p>}

      {open && (
        <ul className="mt-3 flex flex-col divide-y divide-navy-800 border-t border-navy-700">
          {list.map((m) => (
            <li key={`${m.kind}:${m.id}`} className="py-2 flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
              <span className="min-w-0 flex-1">
                <span className="text-white">{team(m.a)}</span> <span className="text-gray-500">vs</span> <span className="text-white">{team(m.b)}</span>
                <span className="block text-gray-500 text-xs">
                  {m.type === 'S' ? t('dupr.singles') : t('dupr.doubles')}
                  {m.games.length > 0 && ` · ${m.games.map(([a, b]) => `${a}-${b}`).join(', ')}`}
                </span>
              </span>
              <span className="text-xs shrink-0">
                {m.exported_at ? (
                  <span className="text-gray-300">
                    ✓ {t('dupr.exportedOn', { date: localDate(new Date(m.exported_at), 'vi-VN') })}{' '}
                    <button type="button" className="underline text-gray-400" disabled={busy} onClick={() => mark([{ kind: m.kind, id: m.id }], false)}>{t('dupr.unmark')}</button>
                  </span>
                ) : m.ready ? (
                  <span className="text-lime-300">{t('dupr.ready')}</span>
                ) : m.no_score ? (
                  <span className="text-gray-500">{t('dupr.noScore')}</span>
                ) : (
                  <span className="text-amber-200">{t('dupr.missing', { names: m.missing.join(', ') })}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
