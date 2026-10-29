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
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  // Missing DUPR IDs filled in a pop-up right here (saved on the member, like the members page).
  const [fixOpen, setFixOpen] = useState(false);
  const [ids, setIds] = useState({});
  const [fixErr, setFixErr] = useState('');
  const [showItems, setShowItems] = useState(null); // batch id whose matches are listed
  const [showHistory, setShowHistory] = useState(false);
  const [showDone, setShowDone] = useState(false); // "Lượt đã tải" (confirmed lượt tải) under the sent matches
  const [tab, setTab] = useState(null); // ready | waiting | sent | ineligible (null = the first with matches)
  const [unpicked, setUnpicked] = useState({}); // ready matches the Host took out of the file
  const [justConfirmed, setJustConfirmed] = useState(null); // the lượt tải just confirmed → "Hoàn tác" right there
  // "Thay người": someone cannot get a DUPR ID → another member takes their place in the
  // matches not sent yet, so the other players' matches can still go to DUPR.
  const [rep, setRep] = useState(null); // { from: key, to: member id }
  const [repErr, setRepErr] = useState('');
  const { data: cands } = useLoad(() => (clubId && rep ? api.get(`/api/clubs/${clubId}/dupr/replace`).catch(() => []) : Promise.resolve(null)), [clubId, !!rep]);
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
  // Confirmed lượt tải show on the "đã gửi" tab with Hoàn tác; cancelled ones stay in the history.
  const confirmedBatches = history.filter((b) => b.status === 'confirmed');
  const cancelledBatches = history.filter((b) => b.status !== 'confirmed');
  // A member's ID is saved on the member; a quick-booking player's on their kèo row.
  const keyOf = (p) => p.member_id || (p.part_id ? `p:${p.part_id}` : null);
  const missingPeople = [...new Map(blocked.flatMap((m) => [...m.a, ...m.b]).filter((p) => !p.dupr_id).map((p) => [keyOf(p) || `n:${p.name}`, p])).values()];
  const when = (iso) => localDate(new Date(iso), lang === 'en' ? 'en-GB' : 'vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }, true);

  const refresh = async () => {
    await reload();
    reloadBatches?.();
  };
  async function replace() {
    const p = missingPeople.find((x) => keyOf(x) === rep.from);
    if (!p || !rep.to) return;
    setBusy(true);
    setRepErr('');
    try {
      const r = await api.post(`/api/clubs/${clubId}/dupr/replace`, { ...scope, from_member_id: p.member_id || undefined, from_part_id: p.member_id ? undefined : p.part_id, to_member_id: rep.to });
      const skipped = (r.skipped?.already_in || 0) + (r.skipped?.team_sent || 0);
      setDone(t('duprx.repDone', { from: r.from_name || p.name, to: r.to_name, n: r.replaced }) + (skipped ? ` ${t('duprx.repSkipped', { n: skipped })}` : ''));
      setRep(null);
      await refresh();
    } catch (e) {
      setRepErr(e.message);
    } finally {
      setBusy(false);
    }
  }
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
  const download = async (withMissing, only = null) => {
    setBusy(true);
    setErr('');
    setDone('');
    try {
      const items = (only || (withMissing ? [...ready, ...blocked] : ready)).map((m) => ({ kind: m.kind, id: m.id }));
      const r = await api.post(`/api/clubs/${clubId}/dupr/matches/csv`, { ...scope, score_type: scoreType, allow_missing: withMissing, items, file_name: fileName });
      if (!r.count) {
        setErr(t('duprx.nothingNew'));
        return;
      }
      saveFile(r.csv, fileName);
      setUnpicked({});
      if (r.batch) {
        setDone(t('duprx.downloaded', { n: r.count }));
        setTab('waiting');
      }
      else setLastExport({ items: r.items, count: r.count });
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
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
      setJustConfirmed(action === 'confirm' ? b : null);
      if (action === 'confirm') setTab('sent');
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
      setJustConfirmed(null);
      setTab('waiting');
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
    if (!exported && items.length === 1 && !window.confirm(t('duprx.undoOneAsk'))) return;
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
  const kOf = (m) => `${m.kind}:${m.id}`;
  const ineligible = [...blocked, ...noScore];
  const picked = ready.filter((m) => !unpicked[kOf(m)]);
  const TABS = [
    { key: 'ready', n: ready.length, label: t('duprx.tabReady'), tone: 'text-lime-300' },
    ...(hasBatches ? [{ key: 'waiting', n: waiting.length, label: t('duprx.tabWaiting'), tone: 'text-sky-300' }] : []),
    { key: 'sent', n: sent.length, label: t('duprx.tabSent'), tone: 'text-white' },
    { key: 'ineligible', n: ineligible.length, label: t('duprx.tabIneligible'), tone: 'text-red-300' },
  ];
  const current = tab || (TABS.find((x) => x.n > 0) || TABS[0]).key;

  // One match as a card (like DUPR / Reclub): both teams with initials, the score in the
  // middle, the winning side bright. `selectable`: tap to take it in / out of the file.
  const wonBy = (m) => {
    let a = 0;
    let b = 0;
    for (const [x, y] of m.games) {
      if (Number(x) > Number(y)) a += 1;
      else if (Number(y) > Number(x)) b += 1;
    }
    return a > b ? 'a' : b > a ? 'b' : null;
  };
  const Initials = ({ ps }) => (
    <span className="flex -space-x-2">
      {ps.map((p, i) => (
        <span key={i} className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-navy-800 text-[11px] font-bold ${p.dupr_id ? 'bg-lime-400/20 text-lime-200' : 'bg-amber-400/20 text-amber-200'}`} aria-hidden="true">
          {String(p.name || '?').trim().split(/\s+/).slice(-1)[0].slice(0, 2).toUpperCase()}
        </span>
      ))}
    </span>
  );
  const MatchCard = ({ m, selectable = false, footer = null }) => {
    const w = wonBy(m);
    const on = selectable && !unpicked[kOf(m)];
    const side = (ps, key, right) => (
      <div className={`min-w-0 flex flex-col gap-1.5 ${right ? 'items-end text-right' : ''}`}>
        <Initials ps={ps} />
        <span className={`text-sm leading-snug break-words ${w === key ? 'text-white font-semibold' : w ? 'text-gray-400' : 'text-gray-200'}`}>
          {ps.map((p, i) => (
            <span key={i} className={`block ${p.dupr_id ? '' : 'text-amber-200'}`}>{p.name}</span>
          ))}
        </span>
      </div>
    );
    const body = (
      <>
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          {side(m.a, 'a', false)}
          <span className="text-center pt-1">
            {m.games.length > 1 ? (
              m.games.map(([x, y], i) => <span key={i} className="block text-sm font-extrabold tabular-nums text-sky-300 whitespace-nowrap leading-tight">{x}-{y}</span>)
            ) : (
              <span className="block text-lg font-extrabold tabular-nums text-sky-300 whitespace-nowrap">{m.games.length ? `${m.games[0][0]}-${m.games[0][1]}` : '—'}</span>
            )}
            <span className="block text-[11px] text-gray-500">{m.type === 'S' ? t('dupr.singles') : t('dupr.doubles')}</span>
          </span>
          {side(m.b, 'b', true)}
        </div>
        <div className="flex items-end justify-between gap-2 mt-2">
          <p className="text-xs text-gray-500 break-words min-w-0">{m.date}{m.event ? ` · ${m.event}` : ''}</p>
          {selectable && <span className={`shrink-0 inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold ${on ? 'border-sky-400 bg-sky-400 text-navy-950' : 'border-navy-500'}`} aria-hidden="true">{on ? '✓' : ''}</span>}
        </div>
        {footer}
      </>
    );
    const cls = `relative rounded-xl border p-3 text-left w-full transition ${on ? 'border-sky-400 bg-sky-400/10' : 'border-navy-600 bg-navy-900/40'}`;
    return selectable ? (
      <div className={cls}>
        <button type="button" className="absolute inset-0 rounded-xl" aria-pressed={on} aria-label={`${team(m.a)} vs ${team(m.b)}`} onClick={() => setUnpicked((u) => ({ ...u, [kOf(m)]: !u[kOf(m)] }))} />
        <div className="pointer-events-none">{body}</div>
      </div>
    ) : (
      <div className={cls}>{body}</div>
    );
  };
  const Grid = ({ children }) => <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2 mt-3">{children}</div>;
  const Empty = ({ text }) => <p className="text-gray-400 text-sm mt-4 text-center py-6 rounded-xl border border-dashed border-navy-600">{text}</p>;

  return (
    <section className={bare ? '' : 'card mt-4'} aria-labelledby="dupr-export-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id="dupr-export-title" className="text-white font-semibold">{t('duprx.title')} <Hint inline text={t('duprx.hint')} /></h3>
        <button type="button" className="text-sm text-lime-300 underline underline-offset-2 min-h-[44px] sm:min-h-0" onClick={() => setGuide(true)}>{t('duprx.guideLink')}</button>
      </div>
      <DuprUploadGuide open={guide} onClose={() => setGuide(false)} />

      {/* Tabs: how many matches can be sent, wait for confirmation, are sent, cannot be sent. */}
      <div className={`grid gap-2 mt-3 grid-cols-2 ${TABS.length === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`} role="tablist">
        {TABS.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={current === x.key}
            className={`rounded-xl border px-2 py-2.5 min-h-[44px] text-sm transition ${current === x.key ? 'border-sky-400 bg-sky-400/10' : 'border-navy-600 hover:border-navy-500'}`}
            onClick={() => setTab(x.key)}
          >
            <span className={`font-bold tabular-nums ${x.n ? x.tone : 'text-gray-500'}`}>{x.n}</span> <span className="text-gray-200">{x.label}</span>
          </button>
        ))}
      </div>
      {done && (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 rounded-xl border border-lime-400/30 bg-lime-400/5 px-3 py-2" role="status">
          <p className="text-lime-200 text-sm">{done}</p>
          {justConfirmed && <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => reopen({ ...justConfirmed, status: 'confirmed' })}>{t('duprx.undoBtn')}</button>}
        </div>
      )}
      {err && <p className="text-red-400 text-sm mt-3" role="alert">{err}</p>}

      {current === 'ready' && (
        <div role="tabpanel">
          {!ready.length ? (
            <Empty text={t('duprx.emptyReady')} />
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-2 mt-3">
                <label className="flex items-center gap-2 text-sm text-gray-200 min-h-[44px]">
                  <input type="checkbox" className="h-4 w-4" checked={picked.length === ready.length} onChange={(e) => setUnpicked(e.target.checked ? {} : Object.fromEntries(ready.map((m) => [kOf(m), true])))} />
                  {t('duprx.pickAll', { n: picked.length, total: ready.length })}
                </label>
                {needsScoring && (
                  <label className="text-xs text-gray-400">
                    {t('dupr.scoreType')}
                    <select className="input !py-1.5 mt-1 !w-auto" value={scoreType} onChange={(e) => setScoreType(e.target.value)}>
                      <option value="SIDEOUT">{t('dupr.sideout')}</option>
                      <option value="RALLY">{t('dupr.rally')}</option>
                    </select>
                  </label>
                )}
              </div>
              <Grid>{ready.map((m) => <MatchCard key={kOf(m)} m={m} selectable />)}</Grid>
              <div className="sticky bottom-0 -mx-1 mt-3 bg-navy-800/95 backdrop-blur px-1 pt-2 pb-1">
                <button type="button" className="btn-primary w-full !py-3 text-base" disabled={busy || !picked.length} onClick={() => download(false, picked)}>{t('duprx.downloadBtn', { n: picked.length })}</button>
                <p className="text-xs text-gray-400 mt-1.5 text-center">{t('duprx.afterDownload')}</p>
              </div>
            </>
          )}
          {lastExport?.count > 0 && (
            <div className="flex justify-end mt-2">
              <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => mark(lastExport.items, true)}>{t('dupr.markN', { n: lastExport.count })}</button>
            </div>
          )}
        </div>
      )}

      {current === 'waiting' && (
        <div role="tabpanel">
          {!batches.length ? <Empty text={t('duprx.emptyWaiting')} /> : (
            <ul className="mt-3 flex flex-col gap-3">
              {batches.map((b) => (
                <li key={b.id} className="rounded-xl border border-sky-400/30 bg-sky-400/5 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-gray-100 text-sm">
                      {t('duprx.batchLine', { time: when(b.created_at) })} · <span className="tabular-nums">{t('duprx.batchN', { n: b.count })}</span>
                      {b.with_missing > 0 && <span className="text-amber-200"> · {t('duprx.batchMissing', { n: b.with_missing })}</span>}
                    </span>
                    <span className="text-xs text-sky-300">{t('duprx.batchPending')}</span>
                  </div>
                  <p className="text-gray-300 text-sm mt-1">{t('duprx.batchAsk')} <Hint inline text={t('duprx.batchesHint')} /></p>
                  <Grid>{(b.items || []).map((i) => byKey.get(`${i.kind}:${i.id}`)).filter(Boolean).map((m) => <MatchCard key={kOf(m)} m={m} />)}</Grid>
                  <div className="flex flex-wrap items-center justify-end gap-2 mt-3">
                    <button type="button" className="text-sm text-gray-400 underline underline-offset-2 min-h-[44px] mr-auto" disabled={busy} onClick={() => decide(b, 'cancel')}>{t('duprx.cancelBatch')}</button>
                    <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => again(b)}>{t('duprx.againBtn')}</button>
                    <button type="button" className="btn-primary text-sm" disabled={busy} onClick={() => decide(b, 'confirm')}>{t('duprx.confirmBtn')}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {current === 'sent' && (
        <div role="tabpanel">
          {!sent.length ? <Empty text={t('duprx.emptySent')} /> : (
            <Grid>
              {sent.map((m) => (
                <MatchCard
                  key={kOf(m)}
                  m={m}
                  footer={
                    <p className="text-xs text-lime-300 mt-1">
                      {t('dupr.exportedOn', { date: localDate(new Date(m.exported_at), 'vi-VN') })}{' '}
                      <button type="button" className="underline text-gray-300 hover:text-white ml-1 min-h-[44px] sm:min-h-0" disabled={busy} onClick={() => mark([{ kind: m.kind, id: m.id }], false)}>{t('duprx.undoOne')}</button>
                    </p>
                  }
                />
              ))}
            </Grid>
          )}
          {confirmedBatches.length > 0 && (
            <div className="mt-4">
              <button type="button" className="text-sm font-semibold text-white underline underline-offset-2 min-h-[44px] sm:min-h-0" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
                {showDone ? t('duprx.doneHide') : t('duprx.doneShow', { n: confirmedBatches.length })}
              </button>{' '}
              <Hint inline text={t('duprx.doneHint')} />
              {showDone && (
                <ul className="mt-2 flex flex-col gap-2">
                  {confirmedBatches.map((b) => (
                    <li key={b.id} className="rounded-xl border border-lime-400/30 bg-lime-400/5 p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="text-gray-100 text-sm">
                          {t('duprx.batchLine', { time: when(b.created_at) })} · <span className="tabular-nums">{t('duprx.batchN', { n: b.count })}</span>
                        </span>
                        <span className="text-xs text-lime-300">{t('duprx.statusConfirmed', { time: b.decided_at ? when(b.decided_at) : '—' })} · {t('duprx.lockedNote')}</span>
                      </div>
                      <button type="button" className="text-sm text-gray-300 underline underline-offset-2 mt-1 min-h-[44px] sm:min-h-0" onClick={() => setShowItems(showItems === b.id ? null : b.id)}>{showItems === b.id ? t('duprx.hideItems') : t('duprx.showItems', { n: b.count })}</button>
                      {showItems === b.id && <BatchMatches b={b} />}
                      <div className="flex flex-wrap items-center justify-end gap-2 mt-2">
                        <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => again(b)}>{t('duprx.againBtn')}</button>
                        <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => reopen(b)}>{b.count > 1 ? t('duprx.undoAllBtn', { n: b.count }) : t('duprx.undoBtn')}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {cancelledBatches.length > 0 && (
            <div className="mt-4">
              <button type="button" className="text-sm font-semibold text-white underline underline-offset-2 min-h-[44px] sm:min-h-0" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
                {showHistory ? t('duprx.historyHide') : t('duprx.historyShow', { n: cancelledBatches.length })}
              </button>{' '}
              <Hint inline text={t('duprx.historyHint')} />
              {showHistory && (
                <ul className="mt-2 flex flex-col gap-2">
                  {cancelledBatches.map((b) => (
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
        </div>
      )}

      {current === 'ineligible' && (
        <div role="tabpanel">
          {!ineligible.length ? <Empty text={t('duprx.emptyIneligible')} /> : (
            <>
              {missingNames.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                  {t('duprx.missing', { names: missingNames.join(', ') })}{' '}
                  {missingPeople.some(keyOf) && <button type="button" className="underline text-lime-300 font-semibold" onClick={() => setFixOpen(true)}>{t('quickfix.addDupr')}</button>}
                  {missingPeople.some(keyOf) && <>{' · '}<button type="button" className="underline text-lime-300 font-semibold" onClick={() => { setRepErr(''); setRep({ from: keyOf(missingPeople.find(keyOf)), to: '' }); }}>{t('duprx.repBtn')}</button></>}
                </div>
              )}
              <Grid>
                {ineligible.map((m) => (
                  <MatchCard
                    key={kOf(m)}
                    m={m}
                    footer={
                      <p className={`text-xs mt-1 ${m.no_score ? 'text-gray-400' : 'text-amber-200'}`}>
                        {m.no_score ? t('duprx.whyNoScore') : t('dupr.missing', { names: m.missing.join(', ') })}
                      </p>
                    }
                  />
                ))}
              </Grid>
              {blocked.length > 0 && (
                <div className="flex justify-end mt-3">
                  <button
                    type="button"
                    className="text-sm text-gray-400 underline underline-offset-2 min-h-[44px]"
                    disabled={busy}
                    onClick={() => window.confirm(t('duprx.askMissing', { names: missingNames.join(', '), n: blocked.length })) && download(true, blocked)}
                  >
                    {t('duprx.downloadMissing', { n: blocked.length })}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Modal open={!!rep} title={t('duprx.repTitle')} onClose={() => setRep(null)}>
        {rep && (() => {
          const p = missingPeople.find((x) => keyOf(x) === rep.from);
          const n = blocked.filter((m) => [...m.a, ...m.b].some((x) => keyOf(x) === rep.from)).length;
          const options = (cands || []).filter((c) => c.id !== p?.member_id);
          return (
            <div className="grid gap-3">
              <p className="text-gray-400 text-sm">{t('duprx.repHint')}</p>
              <div>
                <label className="text-xs text-gray-400" htmlFor="rep-from">{t('duprx.repFrom')}</label>
                <select id="rep-from" className="input" value={rep.from} onChange={(e) => setRep({ ...rep, from: e.target.value })}>
                  {missingPeople.filter(keyOf).map((x) => <option key={keyOf(x)} value={keyOf(x)}>{x.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400" htmlFor="rep-to">{t('duprx.repTo')}</label>
                {!cands ? <p className="text-gray-500 text-sm">{t('common.loading')}</p> : (
                  <select id="rep-to" className="input" value={rep.to} onChange={(e) => setRep({ ...rep, to: e.target.value })}>
                    <option value="">{t('duprx.repPick')}</option>
                    {options.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.dupr_id ? ` · ${c.dupr_id}` : ` · ${t('duprx.repNoId')}`}</option>)}
                  </select>
                )}
              </div>
              <p className="text-amber-200 text-sm">{t('duprx.repCount', { name: p?.name || '—', n })}</p>
              {repErr && <p className="text-red-400 text-sm">{repErr}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setRep(null)}>{t('common.cancel')}</button>
                <button type="button" className="btn-primary" disabled={busy || !rep.to} onClick={replace}>{t('duprx.repSave')}</button>
              </div>
            </div>
          );
        })()}
      </Modal>

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
    </section>
  );
}
