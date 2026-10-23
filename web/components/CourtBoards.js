'use client';
import { Avatar } from '@/components/PlayerChip';
import { useI18n } from '@/context/I18nContext';
import { levelText } from '@/lib/levels';
import { formatVnd } from '@/lib/format';

// DUPR (verified only; none yet = "DUPR NR") and how reliable it is ("Uy tín 80%").
export function DuprBadge({ c, t }) {
  const v = c?.dupr_verified ?? c?.dupr;
  if (v == null) return <span className="rounded border border-navy-500 px-1 text-[10px] font-bold text-gray-300">{t('dupr.nr')}</span>;
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
      <span className="rounded bg-sky-600/80 px-1 text-[10px] font-bold text-white">DUPR {Number(v).toFixed(2)}</span>
      {c.dupr_rel != null && <span className="text-[11px] text-gray-300">{t('public.reliability')} {Math.round(Number(c.dupr_rel))}%</span>}
    </span>
  );
}

// Money on a player: Miễn phí / no fee / uses a pass / Đã thu / Chưa thu. Only a cancelled
// row says how much is still owed.
export function moneyOf(p, kind, fee, t) {
  const c = p.card || {};
  const owed = Number(p.fee_amount ?? fee ?? 0);
  if ((p.tags || []).includes('free') && kind !== 'cancelled') return [`${t('people.tag_free')}`, 'border-navy-600 text-gray-200'];
  if (p.is_organizer && p.fee_amount != null && Number(p.fee_amount) === 0) return [t('people.noFee'), 'border-navy-600 text-gray-400'];
  if (p.paid_by_plan && kind !== 'cancelled') return [c.vip ? t(`events.usesPass_${c.vip_period || 'any'}`) : t('events.paidByPlan'), 'border-lime-400/40 text-lime-300'];
  if (p.fee_paid) return [`✓ ${t('common.paid')}`, 'border-lime-400/60 text-lime-300'];
  if (owed <= 0 && kind !== 'cancelled') return [t('people.noFee'), 'border-navy-600 text-gray-400'];
  if (kind !== 'cancelled' || p.late_cancel) return [`${t('common.unpaid')}${kind === 'cancelled' && owed > 0 ? ` · ${formatVnd(owed)}` : ''}`, 'border-yellow-400/50 text-yellow-200'];
  return null;
}

// One board per court ("Sân 3 · 17:00–20:00 · 6/8"; one court: the whole kèo): each player
// a tile with the photo, name, gender, DUPR · Uy tín, (Host) Đã thu / Chưa thu and the
// check-in button, then a dashed "Slot trống" for every place not taken. Tap a tile:
// onManage(p) (the Host's player sheet, a coordinator's "Đổi sân").
export default function CourtBoards({ event, rows, sport, money = false, onManage, onAction }) {
  const { t } = useI18n();
  const groups = event.groups?.length > 1 ? event.groups : [];
  // One court: a single board with every place of the kèo.
  const boards = !groups.length ? [{ key: 'all', title: t('elive.allPlayers'), slots: event.slots || null, people: rows }] : [
    ...groups.map((g) => ({ key: g.id, title: `${t('egroups.courtN', { n: g.courts || '?' })}${g.play_format ? ` · ${t(`fmt.${g.play_format}`)}` : ''} · ${g.start_time}–${g.end_time}`, slots: g.slots, people: rows.filter((p) => p.group_id === g.id) })),
    { key: 'none', title: t('egroups.noCourt'), slots: null, people: rows.filter((p) => !groups.some((g) => g.id === p.group_id)) },
  ].filter((b) => b.key !== 'none' || b.people.length);
  return (
    <div className="flex flex-col gap-3 mb-4">
      {boards.map((b) => (
        <section key={b.key} className="card !px-3 sm:!px-4">
          <h3 className="text-white font-semibold mb-2 tabular-nums">{b.title}{b.slots ? <span className="text-gray-400 font-normal"> · {b.people.length}/{b.slots}</span> : null}</h3>
          {b.people.length === 0 && !b.slots ? (
            <p className="text-gray-500 text-sm">—</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {b.people.map((p) => {
                const c = p.card || {};
                const g = c.gender || p.gender;
                const here = p.status === 'checked_in';
                return (
                  <li key={p.id}>
                    <div role="button" tabIndex={0} onClick={() => onManage(p)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onManage(p))} className="flex h-full flex-col items-center gap-1 rounded-xl border border-navy-600 bg-navy-900/50 p-2.5 text-center cursor-pointer hover:border-navy-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400">
                      <Avatar src={c.avatar} uid={c.avatar_uid} v={c.avatar_v} name={p.full_name} size={48} />
                      <span className="text-white text-sm font-semibold break-words leading-tight">{p.full_name}</span>
                      <span className="text-xs text-gray-400">{g ? t(`members.${g}`) : '—'}</span>
                      {sport === 'pickleball' ? <DuprBadge c={c} t={t} /> : <span className="text-xs text-gray-300">{levelText(c.level ?? p.dupr_level, sport, t) || '—'}</span>}
                      {money && (() => { const m = moneyOf(p, 'main', groups.find((x) => x.id === p.group_id)?.fee_amount ?? event.fee_amount, t); return m ? <span className={`rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap ${m[1]}`}>{m[0]}</span> : null; })()}
                      <button
                        type="button"
                        aria-label={`${here ? t('staffView.undo') : t('events.checkIn')}: ${p.full_name}`}
                        onClick={(e) => { e.stopPropagation(); onAction(p, here ? 'reset' : 'check-in'); }}
                        className={`mt-1 rounded-full border-2 px-3 py-0.5 text-xs font-semibold whitespace-nowrap ${here ? 'border-lime-400 bg-lime-400 text-navy-950' : 'border-navy-500 text-gray-200 hover:border-lime-400 hover:text-lime-300'}`}
                      >
                        {here ? `✓ ${t('ux.arrived')}` : t('ux.markArrived')}
                      </button>
                    </div>
                  </li>
                );
              })}
              {/* Places nobody has taken yet. */}
              {Array.from({ length: Math.max((b.slots || 0) - b.people.length, 0) }, (_, i) => (
                <li key={`free-${i}`} aria-label={t('egroups.freeSlot')} className="flex min-h-[9.5rem] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-navy-600 p-2.5 text-center text-gray-500">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-navy-500 text-lg" aria-hidden>+</span>
                  <span className="text-xs">{t('egroups.freeSlot')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
