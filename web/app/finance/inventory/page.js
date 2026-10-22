'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useScope } from '@/lib/useScope';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { todayYmd, localDate } from '@/lib/dates';
import Hint from '@/components/ui/Hint';
import UiIcon from '@/components/ui/UiIcon';

// At or below this many left in the box, an item shows as running low.
const LOW = 6;
// Columns of the ball table (one row per session, newest at the bottom).
const COLS = [
  ['new', 'text-lime-300'],
  ['old', 'text-gray-200'],
  ['broken_now', 'text-red-300'],
  ['played', 'text-white font-semibold'],
  ['playable', 'text-sky-200'],
  ['left', 'text-amber-200 font-bold'],
];
// Pickleball balls come with 40 (outdoor) or 48 holes; nothing to type.
const HOLES = [40, 48];
const dm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function MoveForm({ base, item, kind, isClub, onDone, onCancel }) {
  const { t } = useI18n();
  const [f, setF] = useState({ quantity: '', unit_cost: '', occurred_on: todayYmd(), note: '', record_expense: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`${base}/${item.id}/moves`, {
        kind,
        quantity: Number(f.quantity),
        unit_cost: kind === 'purchase' ? Number(f.unit_cost) : undefined,
        occurred_on: f.occurred_on,
        note: f.note,
        record_expense: isClub && f.record_expense,
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs text-gray-400">{t('inventory.quantity')} ({item.unit})</label>
        <input className="input" type="number" inputMode="numeric" required autoFocus min={kind === 'adjust' ? undefined : 1} value={f.quantity} onChange={set('quantity')} />
      </div>
      <div>
        <label className="text-xs text-gray-400">{t('inventory.date')}</label>
        <input className="input" type="date" value={f.occurred_on} onChange={set('occurred_on')} />
      </div>
      {kind === 'purchase' && (
        <>
          <div className="col-span-2">
            <label className="text-xs text-gray-400">{t('inventory.unitCost')}</label>
            <input className="input" type="number" inputMode="numeric" required min="0" step="1" value={f.unit_cost} onChange={set('unit_cost')} />
          </div>
          {f.quantity && f.unit_cost && <p className="col-span-2 text-gray-300 text-sm">= {formatVnd(Number(f.quantity) * Number(f.unit_cost))}</p>}
          {isClub && (
            <label className="col-span-2 flex items-center gap-2 text-sm text-gray-200">
              <input type="checkbox" checked={f.record_expense} onChange={set('record_expense')} />
              {t('inventory.recordExpense')}
            </label>
          )}
        </>
      )}
      {kind === 'adjust' && <p className="col-span-2 text-gray-500 text-xs -mt-1">{t('inventory.adjustHint')}</p>}
      <div className="col-span-2">
        <label className="text-xs text-gray-400">{t('inventory.note')}</label>
        <input className="input" value={f.note} onChange={set('note')} />
      </div>
      {error && <p className="col-span-2 text-red-400 text-sm">{error}</p>}
      <div className="col-span-2 flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>{t('common.cancel')}</button>
        <button className="btn-primary flex-1" disabled={busy}>{t('common.save')}</button>
      </div>
    </form>
  );
}

// One session of the ball table: new balls taken out, old balls played again, balls broken.
function SessionForm({ base, item, session, onDone, onCancel }) {
  const { t } = useI18n();
  const [f, setF] = useState(() => ({
    occurred_on: session?.date || todayYmd(),
    new_out: session ? String(session.new_out ?? session.new) : '',
    old_used: session ? String(session.old) : '',
    broken: session ? String(session.broken_now) : '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Old balls still playable before this date: the last session before it.
  const before = [...(item.log || [])].filter((r) => r.date < f.occurred_on).at(-1);
  const playable = before ? before.playable : 0;
  const oldUsed = f.old_used === '' ? playable : Number(f.old_used);
  const onCourt = oldUsed + Number(f.new_out || 0);

  async function submit(e) {
    e.preventDefault();
    if (oldUsed > playable) return setError(t('inventory.oldTooMany', { n: playable }));
    // Broken balls: old ones played, or new ones taken out this session.
    if (Number(f.broken || 0) > onCourt) return setError(t('inventory.brokenTooMany', { n: onCourt, old: oldUsed, fresh: Number(f.new_out || 0) }));
    setBusy(true);
    setError('');
    try {
      await api.post(`${base}/${item.id}/sessions`, { occurred_on: f.occurred_on, new_out: Number(f.new_out || 0), old_used: oldUsed, broken: Number(f.broken || 0) });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className="text-xs text-gray-400">{t('inventory.date')}</label>
        <input className="input" type="date" required value={f.occurred_on} disabled={!!session} onChange={(e) => setF({ ...f, occurred_on: e.target.value })} />
      </div>
      <div>
        <label className="text-xs text-gray-400">{t('inventory.newOut')}</label>
        <input className="input" type="number" inputMode="numeric" min="0" autoFocus placeholder="0" value={f.new_out} onChange={(e) => setF({ ...f, new_out: e.target.value })} />
        <p className="text-gray-500 text-[11px] mt-1">{t('inventory.inBox', { n: item.stock + (session ? session.new_out ?? session.new : 0) })}</p>
      </div>
      <div>
        <label className="text-xs text-gray-400">{t('inventory.oldUsed')}</label>
        <input className="input" type="number" inputMode="numeric" min="0" max={playable} placeholder={String(playable)} value={f.old_used} onChange={(e) => setF({ ...f, old_used: e.target.value })} />
        <p className="text-gray-500 text-[11px] mt-1">{t('inventory.oldHint', { n: playable })}</p>
      </div>
      <div className="col-span-2">
        <label className="text-xs text-gray-400">{t('inventory.brokenNow')}</label>
        <input className="input" type="number" inputMode="numeric" min="0" placeholder="0" value={f.broken} onChange={(e) => setF({ ...f, broken: e.target.value })} />
        <p className="text-gray-500 text-[11px] mt-1">{t('inventory.onCourt', { n: onCourt })}</p>
      </div>
      <p className="col-span-2 text-gray-500 text-xs">{t('inventory.sessionHint2')}</p>
      {error && <p className="col-span-2 text-red-400 text-sm">{error}</p>}
      <div className="col-span-2 flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>{t('common.cancel')}</button>
        <button className="btn-primary flex-1" disabled={busy}>{t('common.save')}</button>
      </div>
    </form>
  );
}

// The ball table: one row per session (every session played, even with 0 new / 0 broken),
// tap a date to fix it.
function BallTable({ item, onEdit }) {
  const { t } = useI18n();
  const log = item.log || [];
  if (!log.length) return <p className="text-gray-500 text-sm mb-3">{t('inventory.noLog')}</p>;
  return (
    <div className="table-wrap mb-3 rounded-xl border border-navy-700 max-h-[28rem] overflow-y-auto">
      <table className="text-sm w-full border-collapse min-w-[34rem] mobile-list">
        <thead className="sticky top-0 z-10 bg-navy-800">
          <tr className="text-gray-300">
            <th className="text-left font-normal text-gray-400 px-3 py-2 border-b border-navy-600">{t('inventory.date')}</th>
            {COLS.map(([k]) => (
              <th key={k} className="px-2 py-2 text-right font-normal text-gray-400 leading-tight border-b border-navy-600">{t(`inventory.col_${k}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {log.map((r) => (
            <tr key={r.date} className="border-t border-navy-700 hover:bg-navy-800/60">
              <td className="px-3 py-2 whitespace-nowrap">
                <button type="button" className="text-gray-100 hover:text-lime-300 underline decoration-dotted underline-offset-2" title={t('inventory.editSession', { d: dm(r.date) })} onClick={() => onEdit(r)}>
                  {dm(r.date)}
                </button>
              </td>
              {COLS.map(([k, tone]) => (
                <td key={k} className={`px-2 py-2 text-right tabular-nums ${tone}`} data-label={`${t(`inventory.col_${k}`)}:`}>{r[k]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Độ bền bóng of one ball type, from the table.
function Durability({ item }) {
  const { t } = useI18n();
  if (!item.sessions_logged) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      {[
        [t('inventory.durability'), item.play_durability != null ? t('inventory.durabilityV', { n: item.play_durability }) : t('inventory.noBreakYet')],
        [t('inventory.avgPlayed'), item.avg_played ?? '—'],
        [t('inventory.costPerSession'), item.ball_cost_per_session != null ? formatVnd(item.ball_cost_per_session) : '—'],
        [t('inventory.sessionsLogged'), item.sessions_logged],
      ].map(([k, v]) => (
        <div key={k} className="rounded-lg border border-navy-700 bg-navy-900/60 px-3 py-2">
          <p className="text-gray-400 text-xs">{k}</p>
          <p className="text-white font-semibold tabular-nums">{v}</p>
        </div>
      ))}
    </div>
  );
}

// The ball store of the club — or of the organiser's Xé Vé kèo. Balls bought go in;
// each session logs the new balls taken out and the balls that broke.
export default function InventoryPage() {
  const { t, lang, sport } = useI18n();
  const badminton = sport === 'badminton';
  const { workspace } = useWorkspace();
  const { scoped: isClub } = useScope();
  const { club } = useDefaultClub();
  const base = isClub ? (club ? `/api/clubs/${club.id}/inventory` : null) : '/api/inventory';
  const { data: items, loading, reload } = useLoad(() => (base ? api.get(base) : Promise.resolve([])), [base]);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', holes: 40, unit: 'quả' });
  const [move, setMove] = useState(null); // { item, kind }
  const [session, setSession] = useState(null); // { item, row? }
  const [openHistory, setOpenHistory] = useState(null);
  const [error, setError] = useState('');

  async function addItem(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(base, badminton ? { ...newItem, holes: null } : newItem);
      setAdding(false);
      setNewItem({ name: '', holes: 40, unit: 'quả' });
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeMove(item, m) {
    if (!window.confirm(t('inventory.deleteConfirm'))) return;
    try {
      await api.del(`${base}/${item.id}/moves/${m.id}`);
      reload();
    } catch (err) {
      window.alert(err.message);
    }
  }

  const list = items || [];
  const icon = badminton ? 'shuttle' : 'paddle';
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <Hint text={t('inventory.hint')} />
        <button className="btn-primary text-sm shrink-0" onClick={() => setAdding(true)} disabled={!base}>+ {t('inventory.addItem')}</button>
      </div>

      {list.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[
            [icon, t('inventory.row_left'), list.reduce((s, i) => s + (i.stock || 0), 0), 'text-lime-400'],
            ['users', t('inventory.inPlay'), list.reduce((s, i) => s + (i.in_play || 0), 0), 'text-white'],
            ['alert', t('inventory.row_broken'), list.reduce((s, i) => s + (i.broken || 0), 0), 'text-red-300'],
            ['money', t('inventory.spent'), formatVnd(list.reduce((s, i) => s + Number(i.total_spent || 0), 0)), 'text-orange-300'],
          ].map(([ic, k, v, tone]) => (
            <div key={k} className="card !p-4">
              <div className="text-gray-400 text-sm">{k}</div>
              <div className={`text-xl font-bold tabular-nums mt-1 ${tone}`}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {!loading && list.length === 0 && <p className="card text-gray-400 text-sm">{t('inventory.none')}</p>}
      <div className="flex flex-col gap-4">
        {list.map((i) => (
          <div key={i.id} className="card !p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <div className="text-white font-semibold">
                  <UiIcon name={icon} className="inline-block w-4 h-4 mr-1.5 -mt-0.5 text-gray-400" />{i.name}
                  {!badminton && i.holes && <span className="ml-2 text-xs rounded-full px-2 py-0.5 bg-navy-700 text-gray-300">{i.holes} {t('inventory.holes').toLowerCase()}</span>}
                  <span className={`ml-2 text-[11px] font-semibold rounded-full border px-2 py-0.5 ${(i.stock || 0) <= 0 ? 'border-red-500/50 text-red-300' : i.stock <= LOW ? 'border-amber-400/50 text-amber-300' : 'border-lime-400/50 text-lime-300'}`}>
                    {(i.stock || 0) <= 0 ? t('finX.stockOut') : i.stock <= LOW ? t('finX.stockLow') : t('finX.stockOk')}
                  </span>
                </div>
                <div className="text-gray-400 text-xs mt-1">
                  {t('inventory.avgCost')}: {i.avg_unit_cost != null ? formatVnd(i.avg_unit_cost) : '—'} · {t('inventory.spent')}: {formatVnd(i.total_spent)} · {t('inventory.inPlay')}: {i.in_play}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-2xl font-bold tabular-nums ${i.stock > 0 ? 'text-lime-400' : 'text-red-400'}`}>{i.stock}</div>
                <div className="text-gray-400 text-xs">{t('inventory.row_left')} ({i.unit})</div>
              </div>
            </div>

            <Durability item={i} />
            <BallTable item={i} onEdit={(row) => setSession({ item: i, row })} />

            <div className="flex flex-wrap gap-2">
              <button className="btn-primary text-sm" onClick={() => setSession({ item: i })}>+ {t('inventory.logSession')}</button>
              <button className="btn-secondary text-sm" onClick={() => setMove({ item: i, kind: 'purchase' })}>+ {t('inventory.purchase')}</button>
              <button className="btn-secondary text-sm" onClick={() => setMove({ item: i, kind: 'adjust' })}>{t('inventory.adjust')}</button>
              <button className="text-gray-400 text-sm underline ml-auto" onClick={() => setOpenHistory(openHistory === i.id ? null : i.id)}>{t('inventory.history')}</button>
            </div>
            {openHistory === i.id && (
              <div className="mt-3 flex flex-col divide-y divide-navy-700 text-sm">
                {i.moves.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-gray-300">
                      {localDate(new Date(`${m.occurred_on}T00:00:00`), lang === 'vi' ? 'vi-VN' : 'en-GB')} · {t(`inventory.kind_${m.kind}`)}{' '}
                      <span className={m.kind === 'purchase' ? 'text-lime-400' : m.quantity < 0 || ['retire', 'use', 'broken'].includes(m.kind) ? 'text-orange-300' : 'text-gray-200'}>
                        {['retire', 'use', 'broken'].includes(m.kind) ? '−' : m.quantity > 0 ? '+' : ''}{m.quantity}
                      </span>
                      {m.unit_cost != null && <span className="text-gray-500"> @ {formatVnd(m.unit_cost)}</span>}
                      {m.note && <span className="text-gray-500"> · {m.note}</span>}
                    </span>
                    <button className="text-red-400/80 text-xs shrink-0" onClick={() => removeMove(i, m)}>{t('common.delete')}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={adding} title={t('inventory.addItem')} onClose={() => setAdding(false)}>
        <form onSubmit={addItem} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-400">{t('inventory.name')}</label>
            <input className="input" required autoFocus placeholder={t('inventory.namePh')} value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
          </div>
          {!badminton && (
            <div>
              <label className="text-xs text-gray-400">{t('inventory.holes')}</label>
              <div className="grid grid-cols-2 gap-1 bg-navy-900 border border-navy-700 rounded-lg p-1" role="radiogroup" aria-label={t('inventory.holes')}>
                {HOLES.map((h) => (
                  <button key={h} type="button" role="radio" aria-checked={Number(newItem.holes) === h} onClick={() => setNewItem({ ...newItem, holes: h })} className={`rounded-md py-1.5 text-sm ${Number(newItem.holes) === h ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-300'}`}>
                    {t('inventory.holesN', { n: h })}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400">{t('inventory.unit')}</label>
            <input className="input" value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} />
          </div>
          {error && <p className="col-span-2 text-red-400 text-sm">{error}</p>}
          <div className="col-span-2 flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
            <button className="btn-primary flex-1">{t('common.save')}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!move} title={move ? `${t(`inventory.${move.kind}`)} · ${move.item.name}` : ''} onClose={() => setMove(null)}>
        {move && (
          <MoveForm
            base={base}
            item={move.item}
            kind={move.kind}
            isClub={isClub}
            onCancel={() => setMove(null)}
            onDone={() => {
              setMove(null);
              reload();
            }}
          />
        )}
      </Modal>

      <Modal open={!!session} title={session ? `${session.row ? t('inventory.editSession', { d: dm(session.row.date) }) : t('inventory.logSession')} · ${session.item.name}` : ''} onClose={() => setSession(null)}>
        {session && (
          <SessionForm
            base={base}
            item={session.item}
            session={session.row}
            onCancel={() => setSession(null)}
            onDone={() => {
              setSession(null);
              reload();
            }}
          />
        )}
      </Modal>
    </>
  );
}
