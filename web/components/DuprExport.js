'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { localDate } from '@/lib/dates';
import Hint from '@/components/ui/Hint';
import Modal from '@/components/Modal';
import GuideModal from '@/components/ui/GuideModal';

// "Gửi trận lên DUPR" inside one event (kèo / session), one tournament, or the club's own
// matches: what can be sent, what is missing, the CSV in DUPR's "Import Matches via CSV"
// template, and the lượt tải (each download, kept on the server) that the Host confirms once
// the file is on DUPR. Pickleball clubs only — renders nothing when DUPR is not available
// here (badminton, migration not run, no permission).
// scope: { event } | { tournament } | { scope: 'club' }
// bare: inside a pop-up (no card), and says so when there is nothing to send.
const GUIDE_STEPS = 5;

export function DuprUploadGuide({ open, onClose }) {
  const { t } = useI18n();
  return (
    <GuideModal
      open={open}
      title={t('duprx.guideTitle')}
      onClose={onClose}
      steps={Array.from({ length: GUIDE_STEPS }, (_, i) => ({ title: t(`duprx.g${i + 1}Title`), body: t(`duprx.g${i + 1}Body`), image: `/guides/dupr-upload/step-${i + 1}.svg` }))}
    />
  );
}

export default function DuprExport({ clubId, scope, fileName = 'dupr-matches', reloadKey, bare = false }) {
  const { t, lang } = useI18n();
  const qs = new URLSearchParams({ ...scope, all: '1' }).toString();
  const { data, error, reload } = useLoad(() => (clubId ? api.get(`/api/clubs/${clubId}/dupr/matches?${qs}`) : Promise.resolve(null)), [clubId, qs, reloadKey]);
  const hasBatches = !!data?.batches;
  const { data: bData, reload: reloadBatches } = useLoad(() => (clubId && hasBatches ? api.get(`/api/clubs/${clubId}/dupr/batches`) : Promise.resolve(null)), [clubId, hasBatches, reloadKey]);
  const [scoreType, setScoreType] = useState('SIDEOUT');
  const [lastExport, setLastExport] = useState(null); // { items, count } — only without lượt tải (migration not run)
  const [choose, setChoose] = useState(false); // the "which matches?" pop-up
  const [guide, setGuide] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  // Missing DUPR IDs filled in a pop-up right here (saved on the member, like the members page).
  const [fixOpen, setFixOpen] = useState(false);
  const [ids, setIds] = useState({});
  const [fixErr, setFixErr] = useState('');
  const [showItems, setShowItems] = useState(null); // batch id whose matches are listed
  const [showHistory, setShowHistory] = useState(false);
  if (bare && error) return <p className="text-red-300 text-sm">{error.payload?.code === 'migration_required' ? t('dupr.needMigration') : error.message}</p>;
  if (bare && !data) return <p className="text-gray-400 text-sm">{t('common.loading')}</p>;
  if (!clubId || error || !data) return null;

  const list = data.matches || [];
  if (!list.length) return bare ? <p className="text-gray-400 text-sm">{t('duprx.none')}</p> : null;
  const sent = list.filter((m) => m.exported_at);
  const waiting = list.filter((m) => !m.exported_at && m.batch);
  const open_ = list.filter((m) => !m.exported_at && !m.batch);
  const ready = open_.filter((m) => m.ready);
  const blocked = open_.filter((m) => !m.ready && !m.no_score);
  const noScore = open_.filter((m) => m.no_score);
  const missingNames = [...new Set(blocked.flatMap((m) => m.missing))];
  // Lượt tải of the matches shown here (a kèo shows only its own).
  // (one whose matches were all marked as sent one by one is left out).
  const here = new Set(waiting.map((m) => `${m.kind}:${m.id}`));
  const batches = (bData?.batches || []).filter((b) => b.status === 'pending' && (b.items || []).some((i) => here.has(`${i.kind}:${i.id}`)));
  // Lượt tải already decided (confirmed / cancelled) for these matches: the file can be
  // downloaded again and a decision made by mistake can be undone ("Mở lại").
  const byKey = new Map(list.map((m) => [`${m.kind}:${m.id}`, m]));
  const history = (bData?.batches || []).filter((b) => b.status !== 'pending' && (b.items || []).some((i) => byKey.has(`${i.kind}:${i.id}`)));
  // A member's ID is saved on the member; a quick-booking player's on their kèo row.
  const keyOf = (p) => p.member_id || (p.part_id ? `p:${p.part_id}` : null);
  const missingPeople = [...new Map(blocked.flatMap((m) => [...m.a, ...m.b]).filter((p) => !p.dupr_id).map((p) => [keyOf(p) || `n:${p.name}`, p])).values()];
  const when = (iso) => localDate(new Date(iso), lang === 'en' ? 'en-GB' : 'vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }, true);

  const refresh = async () => {
    await reload();
    reloadBatches?.();
  };
  async function saveIds() {
    setBusy(true);
    setFixErr('');
    try {
      for (const p of missingPeople) {
        const v = String(ids[keyOf(p)] || '').trim();
        if (!v) continue;
        if (p.member_id) await api.patch(`/api/clubs/${clubId}/members/${p.member_id}/dupr`, { dupr_id: v });
        else if (p.part_id) await api.patch(`/api/clubs/${clubId}/dupr/quick`, { ids: [p.part_id], dupr_id: v });
      }
      setIds({});
      setFixOpen(false);
      await refresh();
    } catch (e) {
      setFixErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  const needsScoring = [...ready, ...blocked].some((m) => !m.scoring);

  const saveFile = (csv, name) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  // withMissing: also the matches where someone has no DUPR ID (their ID cell stays empty).
  const download = async (withMissing) => {
    setChoose(false);
    setBusy(true);
    setErr('');
    setDone('');
    try {
      const items = (withMissing ? [...ready, ...blocked] : ready).map((m) => ({ kind: m.kind, id: m.id }));
      const r = await api.post(`/api/clubs/${clubId}/dupr/matches/csv`, { ...scope, score_type: scoreType, allow_missing: withMissing, items, file_name: fileName });
      if (!r.count) {
        setErr(t('duprx.nothingNew'));
        return;
      }
      saveFile(r.csv, fileName);
      if (r.batch) setDone(t('duprx.downloaded', { n: r.count }));
      else setLastExport({ items: r.items, count: r.count });
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const startDownload = () => (blocked.length ? setChoose(true) : download(false));
  const again = async (b) => {
    setBusy(true);
    setErr('');
    try {
      const r = await api.get(`/api/clubs/${clubId}/dupr/batches/${b.id}/csv`);
      saveFile(r.csv, r.file_name || fileName);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const decide = async (b, action) => {
    if (action === 'cancel' && !window.confirm(t('duprx.cancelAsk', { n: b.count }))) return;
    if (action === 'confirm' && !window.confirm(t('duprx.confirmAsk', { n: b.count }))) return;
    setBusy(true);
    setErr('');
    setDone('');
    try {
      await api.post(`/api/clubs/${clubId}/dupr/batches/${b.id}/${action}`, {});
      setDone(action === 'confirm' ? t('duprx.confirmed', { n: b.count }) : t('duprx.cancelled', { n: b.count }));
      await refresh();
    } catch (e) {
      setErr(e.payload?.code === 'batch_closed' ? t('duprx.batchClosed') : e.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const reopen = async (b) => {
    if (!window.confirm(t(b.status === 'confirmed' ? 'duprx.reopenConfirmedAsk' : 'duprx.reopenCancelledAsk', { n: b.count }))) return;
    setBusy(true);
    setErr('');
    setDone('');
    try {
      await api.post(`/api/clubs/${clubId}/dupr/batches/${b.id}/reopen`, {});
      setDone(t('duprx.reopened', { n: b.count }));
      await refresh();
    } catch (e) {
      setErr(e.payload?.code === 'batch_conflict' ? t('duprx.reopenConflict', { n: e.payload.count || 1 }) : e.message);
    } finally {
      setBusy(false);
    }
  };
  // The matches of one lượt tải, to compare with the Matches list on DUPR.
  const BatchMatches = ({ b }) => (
    <ul className="mt-2 flex flex-col gap-1 text-sm">
      {(b.items || []).map((i) => {
        const m = byKey.get(`${i.kind}:${i.id}`);
        return (
          <li key={`${i.kind}:${i.id}`} className="flex flex-wrap justify-between gap-x-3 text-gray-300">
            <span className="min-w-0 break-words">{m ? <>{team(m.a)} <span className="text-gray-500">vs</span> {team(m.b)}</> : t('duprx.matchGone')}</span>
            {m && <span className="tabular-nums text-gray-400">{m.date} · {m.games.map(([x, y]) => `${x}-${y}`).join(', ')}</span>}
          </li>
        );
      })}
    </ul>
  );
  const mark = async (items, exported) => {
    if (exported && items.length === 1 && !window.confirm(t('duprx.markOneAsk'))) return;
    setBusy(true);
    setErr('');
    try {
      await api.post(`/api/clubs/${clubId}/dupr/matches/mark`, { items, exported });
      if (exported) setLastExport(null);
      await refresh();
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
    <section className={bare ? '' : 'card mt-4'} aria-labelledby="dupr-export-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id="dupr-export-title" className="text-white font-semibold">{t('duprx.title')} <Hint inline text={t('duprx.hint')} /></h3>
        <div className="flex flex-wrap items-center gap-x-4">
          <button type="button" className="text-sm text-lime-300 underline underline-offset-2 min-h-[44px] sm:min-h-0" onClick={() => setGuide(true)}>{t('duprx.guideLink')}</button>
          <button type="button" className="text-sm text-gray-300 underline underline-offset-2 min-h-[44px] sm:min-h-0" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? t('duprx.hideList') : t('duprx.showList', { n: list.length })}
          </button>
        </div>
      </div>
      <DuprUploadGuide open={guide} onClose={() => setGuide(false)} />

      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
        <Count n={ready.length} label={t('duprx.ready')} tone="text-lime-300" />
        {hasBatches && <Count n={waiting.length} label={t('duprx.waiting')} tone={waiting.length ? 'text-sky-300' : 'text-gray-500'} />}
        <Count n={sent.length} label={t('duprx.sent')} tone="text-white" />
        <Count n={blocked.length} label={t('duprx.blocked')} tone={blocked.length ? 'text-amber-300' : 'text-gray-500'} />
        <Count n={noScore.length} label={t('duprx.noScore')} tone="text-gray-500" />
      </div>
      {missingNames.length > 0 && (
        <p className="text-amber-200 text-sm mt-2">
          {t('duprx.missing', { names: missingNames.join(', ') })}{' '}
          {missingPeople.some(keyOf) && <button type="button" className="underline text-lime-300" onClick={() => setFixOpen(true)}>{t('quickfix.addDupr')}</button>}
        </p>
      )}
      <Modal open={fixOpen} title={`${t('quickfix.duprTitle')}`} onClose={() => setFixOpen(false)}>
        <p className="text-gray-400 text-sm mb-3">{t('quickfix.duprHint')}</p>
        <ul className="flex flex-col gap-2">
          {missingPeople.map((p) => (
            <li key={keyOf(p) || p.name} className="flex flex-wrap items-center gap-2">
              <span className="text-gray-100 text-sm min-w-0 flex-1">{p.name}</span>
              {keyOf(p) ? (
                <input className="input !w-40 font-mono uppercase" maxLength={10} value={ids[keyOf(p)] || ''} onChange={(e) => setIds({ ...ids, [keyOf(p)]: e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase() })} aria-label={`DUPR ID ${p.name}`} />
              ) : (
                <span className="text-gray-500 text-xs">{t('quickfix.duprNoMember')}</span>
              )}
            </li>
          ))}
        </ul>
        {fixErr && <p className="text-red-400 text-sm mt-2">{fixErr}</p>}
        <div className="flex justify-end mt-4">
          <button type="button" className="btn-primary max-sm:w-full sm:px-8" disabled={busy || !Object.values(ids).some((v) => v)} onClick={saveIds}>{t('common.save')}</button>
        </div>
      </Modal>

      {/* Which matches go in the file: by default only those where everyone has a DUPR ID. */}
      <Modal
        open={choose}
        title={t('duprx.chooseTitle')}
        onClose={() => setChoose(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => download(true)}>{t('duprx.withMissingBtn', { n: ready.length + blocked.length })}</button>
            <button type="button" className="btn-primary" disabled={busy || !ready.length} onClick={() => download(false)}>{t('duprx.onlyReadyBtn', { n: ready.length })}</button>
          </>
        }
      >
        <p className="text-gray-200 text-sm leading-relaxed">{t('duprx.chooseBody', { n: blocked.length, names: missingNames.join(', ') })}</p>
        <ul className="text-sm text-gray-300 mt-3 flex flex-col gap-2 list-disc pl-5">
          <li>{t('duprx.chooseOnly', { n: ready.length })}</li>
          <li>{t('duprx.chooseAll')}</li>
        </ul>
        {!ready.length && <p className="text-amber-200 text-sm mt-3">{t('duprx.noneReady')}</p>}
      </Modal>

      <div className="flex flex-wrap items-end justify-end gap-2 mt-3">
        {needsScoring && ready.length + blocked.length > 0 && (
          <label className="text-xs text-gray-400 mr-auto">
            {t('dupr.scoreType')}
            <select className="input !py-1.5 mt-1 !w-auto" value={scoreType} onChange={(e) => setScoreType(e.target.value)}>
              <option value="SIDEOUT">{t('dupr.sideout')}</option>
              <option value="RALLY">{t('dupr.rally')}</option>
            </select>
          </label>
        )}
        <button type="button" className="btn-primary text-sm" disabled={busy || !(ready.length + blocked.length)} onClick={startDownload}>{t('duprx.downloadBtn', { n: ready.length })}</button>
        {lastExport?.count > 0 && (
          <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => mark(lastExport.items, true)}>{t('dupr.markN', { n: lastExport.count })}</button>
        )}
      </div>
      {done && <p className="text-lime-200 text-sm mt-2" role="status">{done}</p>}
      {err && <p className="text-red-400 text-sm mt-2" role="alert">{err}</p>}

      {batches.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-white">{t('duprx.batchesTitle')} <Hint inline text={t('duprx.batchesHint')} /></p>
          <ul className="mt-2 flex flex-col gap-2">
            {batches.map((b) => (
              <li key={b.id} className="rounded-xl border border-sky-400/30 bg-sky-400/5 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-gray-100 text-sm">
                    {t('duprx.batchLine', { time: when(b.created_at) })} · <span className="tabular-nums">{t('duprx.batchN', { n: b.count })}</span>
                    {b.with_missing > 0 && <span className="text-amber-200"> · {t('duprx.batchMissing', { n: b.with_missing })}</span>}
                  </span>
                  <span className="text-xs text-sky-300">{t('duprx.batchPending')}</span>
                </div>
                <p className="text-gray-400 text-sm mt-1">{t('duprx.batchAsk')}</p>
                <button type="button" className="text-sm text-gray-300 underline underline-offset-2 mt-1 min-h-[44px] sm:min-h-0" onClick={() => setShowItems(showItems === b.id ? null : b.id)}>{showItems === b.id ? t('duprx.hideItems') : t('duprx.showItems', { n: b.count })}</button>
                {showItems === b.id && <BatchMatches b={b} />}
                <div className="flex flex-wrap items-center justify-end gap-2 mt-2">
                  <button type="button" className="text-sm text-gray-400 underline underline-offset-2 min-h-[44px] mr-auto" disabled={busy} onClick={() => decide(b, 'cancel')}>{t('duprx.cancelBatch')}</button>
                  <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => again(b)}>{t('duprx.againBtn')}</button>
                  <button type="button" className="btn-primary text-sm" disabled={busy} onClick={() => decide(b, 'confirm')}>{t('duprx.confirmBtn')}</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4">
          <button type="button" className="text-sm font-semibold text-white underline underline-offset-2 min-h-[44px] sm:min-h-0" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
            {showHistory ? t('duprx.historyHide') : t('duprx.historyShow', { n: history.length })}
          </button>{' '}
          <Hint inline text={t('duprx.historyHint')} />
          {showHistory && (
            <ul className="mt-2 flex flex-col gap-2">
              {history.map((b) => (
                <li key={b.id} className="rounded-xl border border-navy-600 bg-navy-900/40 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-gray-100 text-sm">
                      {t('duprx.batchLine', { time: when(b.created_at) })} · <span className="tabular-nums">{t('duprx.batchN', { n: b.count })}</span>
                    </span>
                    <span className={`text-xs ${b.status === 'confirmed' ? 'text-lime-300' : 'text-gray-400'}`}>
                      {t(b.status === 'confirmed' ? 'duprx.statusConfirmed' : 'duprx.statusCancelled', { time: b.decided_at ? when(b.decided_at) : '—' })}
                    </span>
                  </div>
                  <button type="button" className="text-sm text-gray-300 underline underline-offset-2 mt-1 min-h-[44px] sm:min-h-0" onClick={() => setShowItems(showItems === b.id ? null : b.id)}>{showItems === b.id ? t('duprx.hideItems') : t('duprx.showItems', { n: b.count })}</button>
                  {showItems === b.id && <BatchMatches b={b} />}
                  <div className="flex flex-wrap items-center justify-end gap-2 mt-2">
                    <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => again(b)}>{t('duprx.againBtn')}</button>
                    <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => reopen(b)}>{t(b.status === 'confirmed' ? 'duprx.reopenConfirmedBtn' : 'duprx.reopenCancelledBtn')}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
              <span className="text-xs max-sm:basis-full sm:shrink-0 sm:text-right">
                {m.exported_at ? (
                  <span className="text-gray-300">
                    {t('dupr.exportedOn', { date: localDate(new Date(m.exported_at), 'vi-VN') })}{' '}
                    <button type="button" className="underline text-gray-400" disabled={busy} onClick={() => mark([{ kind: m.kind, id: m.id }], false)}>{t('dupr.unmark')}</button>
                  </span>
                ) : m.batch ? (
                  <span className="text-sky-300">{t('duprx.inBatch', { time: when(m.batch.created_at) })}</span>
                ) : m.no_score ? (
                  <span className="text-gray-500">{t('dupr.noScore')}</span>
                ) : (
                  <span className="flex flex-wrap items-center gap-x-3 sm:flex-col sm:items-end gap-y-0.5">
                    {m.ready ? <span className="text-lime-300">{t('dupr.ready')}</span> : <span className="text-amber-200">{t('dupr.missing', { names: m.missing.join(', ') })}</span>}
                    <button type="button" className="underline text-gray-400" disabled={busy} onClick={() => mark([{ kind: m.kind, id: m.id }], true)}>{t('duprx.markOne')}</button>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
