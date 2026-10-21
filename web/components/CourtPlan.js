'use client';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import Hint from '@/components/ui/Hint';

// "3" / "2, 3" -> ['3'] / ['2', '3'] (same rule as the server).
export const courtList = (raw) => [...new Set(String(raw || '').split(/[,;/\s-]+/).map((x) => x.replace(/^sân/i, '').trim()).filter(Boolean))];

// The level used to spread players evenly: the Host's score, verified DUPR, then typed level.
const levelOf = (p) => Number(p.card?.skill_score ?? p.card?.dupr_verified ?? p.card?.dupr ?? p.card?.level ?? p.dupr_level ?? 0) || 0;

// Xếp sân: before they go out, the Host puts each player of a time slot on one of its courts
// (only where one time slot has 2 courts or more). "Chia đều" spreads them by level.
export default function CourtPlan({ event, rows, onSaved }) {
  const { t } = useI18n();
  const groups = event.groups?.length > 1 ? event.groups : null;
  // One block per time slot with 2+ courts: a group, or the whole kèo.
  const blocks = useMemo(() => {
    if (groups) return groups.map((g) => ({ key: g.id, label: `${g.start_time}–${g.end_time}`, courts: courtList(g.courts), people: rows.filter((p) => p.group_id === g.id) })).filter((b) => b.courts.length >= 2);
    const courts = courtList(event.court_labels);
    return courts.length >= 2 ? [{ key: 'all', label: null, courts, people: rows }] : [];
  }, [groups, rows, event.court_labels]);
  const saved = useMemo(() => Object.fromEntries(rows.map((p) => [p.id, p.court || ''])), [rows]);
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (!blocks.length) return null;
  const changed = rows.some((p) => (draft[p.id] || '') !== (saved[p.id] || ''));

  // Snake order by level (strong, weak, …) so each court gets a similar mix.
  function spread(b) {
    const sorted = [...b.people].sort((x, y) => levelOf(y) - levelOf(x));
    const next = { ...draft };
    sorted.forEach((p, i) => {
      const round = Math.floor(i / b.courts.length);
      const pos = i % b.courts.length;
      next[p.id] = b.courts[round % 2 === 0 ? pos : b.courts.length - 1 - pos];
    });
    setDraft(next);
  }

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      await api.put(`/api/events/${event.id}/courts`, { assign: rows.map((p) => ({ id: p.id, court: draft[p.id] || null })) });
      setMsg(`✓ ${t('common.saved')}`);
      onSaved?.();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-white font-semibold">🏟 {t('egroups.planTitle')} <Hint inline text={t('egroups.planHint')} /></h2>
        <div className="flex items-center gap-2">
          {msg && <span className={`text-xs ${msg.startsWith('✓') ? 'text-lime-300' : 'text-red-300'}`}>{msg}</span>}
          <button type="button" className="btn-primary text-sm" disabled={busy || !changed} onClick={save}>{t('egroups.planSave')}</button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {blocks.map((b) => {
          const unplaced = b.people.filter((p) => !draft[p.id]);
          return (
            <div key={b.key} className="rounded-xl border border-navy-600 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-sm text-gray-200">
                  {b.label && <span className="font-semibold text-white tabular-nums mr-2">🕒 {b.label}</span>}
                  {b.courts.map((c) => `${t('egroups.courtN', { n: c })} (${b.people.filter((p) => draft[p.id] === c).length})`).join(' · ')}
                  {unplaced.length > 0 && <span className="text-amber-300 ml-2">· {t('egroups.unplaced', { n: unplaced.length })}</span>}
                </p>
                <button type="button" className="btn-secondary !py-1 text-xs" disabled={!b.people.length} onClick={() => spread(b)}>⚖️ {t('egroups.spread')}</button>
              </div>
              {b.people.length === 0 ? (
                <p className="text-gray-500 text-sm">{t('egroups.nobody')}</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {b.courts.map((c) => (
                    <div key={c} className="rounded-lg bg-navy-900/60 p-2">
                      <p className="text-lime-300 text-xs font-semibold mb-1">🏟 {t('egroups.courtN', { n: c })}</p>
                      <ul className="flex flex-col gap-1">
                        {b.people.filter((p) => draft[p.id] === c).map((p) => (
                          <Pick key={p.id} p={p} courts={b.courts} value={c} onChange={(v) => setDraft({ ...draft, [p.id]: v })} />
                        ))}
                      </ul>
                    </div>
                  ))}
                  {unplaced.length > 0 && (
                    <div className="rounded-lg border border-dashed border-amber-300/50 p-2">
                      <p className="text-amber-200 text-xs font-semibold mb-1">{t('egroups.notYet')}</p>
                      <ul className="flex flex-col gap-1">
                        {unplaced.map((p) => (
                          <Pick key={p.id} p={p} courts={b.courts} value="" onChange={(v) => setDraft({ ...draft, [p.id]: v })} />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Pick({ p, courts, value, onChange }) {
  const { t } = useI18n();
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span className="text-gray-100 break-words min-w-0">{p.full_name}</span>
      <select className="input !w-auto !py-1 text-xs" aria-label={t('egroups.courtFor', { name: p.full_name })} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {courts.map((c) => <option key={c} value={c}>{t('egroups.courtN', { n: c })}</option>)}
      </select>
    </li>
  );
}
