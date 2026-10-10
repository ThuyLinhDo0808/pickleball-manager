'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { Avatar } from '@/components/PlayerChip';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '');
const daysLeft = (until) => Math.ceil((new Date(until) - Date.now()) / 86400000);

// "Move to review": why, and for how long the member may not join the club's events.
export function ReviewModal({ club, member, open, onClose, onDone }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(7);
  const [unit, setUnit] = useState('days');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setReason('');
      setAmount(7);
      setUnit('days');
      setError('');
    }
  }, [open]);
  if (!member) return null;
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/clubs/${club.id}/members/${member.id}/review`, { reason, [unit]: Number(amount) });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} title={`⚠️ ${t('mod.reviewTitle', { name: member.full_name })}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-gray-300 text-sm">{t('mod.reviewIntro')}</p>
        <label className="block">
          <span className="text-xs text-gray-300">{t('mod.reason')} *</span>
          <textarea className="input mt-1" rows={3} required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('mod.reasonPh')} />
        </label>
        <div>
          <span className="text-xs text-gray-300">{t('mod.duration')} *</span>
          <div className="mt-1 flex gap-2">
            <input className="input !w-24" type="number" min={1} max={unit === 'days' ? 366 : 12} required value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select className="input !w-auto" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="days">{t('mod.days')}</option>
              <option value="months">{t('mod.months')}</option>
            </select>
          </div>
        </div>
        <p className="rounded-lg border border-amber-300/40 bg-amber-300/5 px-3 py-2 text-amber-100 text-xs">{t('mod.reviewNote')}</p>
        {error && <p className="text-red-300 text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={busy}>{t('mod.reviewSubmit')}</button>
        </div>
      </form>
    </Modal>
  );
}

// Remove from the club: reason (the player is told), optionally block from sign-ups.
function RemoveModal({ club, member, open, onClose, onDone }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [block, setBlock] = useState(false);
  const [scope, setScope] = useState('club');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setReason(member?.review_reason || '');
      setBlock(false);
      setScope('club');
      setError('');
    }
  }, [open, member?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!member) return null;
  async function submit(e) {
    e.preventDefault();
    if (!window.confirm(t('mod.removeConfirm', { name: member.full_name }))) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/clubs/${club.id}/members/${member.id}/remove`, { reason, block, block_scope: scope });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} title={`⛔ ${t('mod.removeTitle', { name: member.full_name })}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="block">
          <span className="text-xs text-gray-300">{t('mod.reason')} *</span>
          <textarea className="input mt-1" rows={3} required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label className="flex items-start gap-2 text-sm text-gray-200">
          <input type="checkbox" className="mt-1" checked={block} onChange={(e) => setBlock(e.target.checked)} />
          <span>{t('mod.block')}</span>
        </label>
        {block && (
          <div className="flex flex-col gap-1 pl-6 text-sm text-gray-300">
            <label className="flex items-center gap-2"><input type="radio" checked={scope === 'club'} onChange={() => setScope('club')} />{t('mod.scope_club')}</label>
            <label className="flex items-center gap-2"><input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />{t('mod.scope_all')}</label>
          </div>
        )}
        <p className="text-gray-500 text-xs">{t('mod.removeNote')}</p>
        {error && <p className="text-red-300 text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="rounded-lg px-3 py-2 font-semibold bg-red-500 text-white disabled:opacity-40" disabled={busy}>⛔ {t('mod.removeSubmit')}</button>
        </div>
      </form>
    </Modal>
  );
}

// One line of the moderation history.
function HistoryLine({ r }) {
  const { t } = useI18n();
  return (
    <li className="py-2 text-sm">
      <span className="text-gray-500 text-xs mr-2">{fmtDate(r.created_at)}</span>
      <span className="text-white font-medium">{r.full_name || '—'}</span>{' '}
      <span className="text-gray-300">{t(`mod.act_${r.action}`, { to: r.to_type ? t(`mod.place_${r.to_type}`) : '' })}</span>
      {r.until && r.action === 'review' && <span className="text-gray-400"> · {t('mod.until', { date: fmtDate(r.until) })}</span>}
      {r.blocked && <span className="text-red-300"> · 🚫 {t(`mod.blocked_${r.block_scope || 'club'}`)}</span>}
      {r.reason && <span className="block text-gray-400 text-xs">“{r.reason}”</span>}
      {r.actor_email && <span className="block text-gray-600 text-[11px]">{t('mod.by', { who: r.actor_email })}</span>}
    </li>
  );
}

// The "To review" tab: members under review (restore / remove), who is blocked, and the
// club's whole history (kept when the club changes manager).
export function ReviewTab({ club, members, onChanged }) {
  const { t } = useI18n();
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(null);
  const [to, setTo] = useState({});
  const [page, setPage] = useState(1);
  const { data: mod, reload } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/moderation?page=${page}`).catch(() => null) : Promise.resolve(null)), [club?.id, page, members.length]);
  const changed = () => {
    reload();
    onChanged();
  };
  async function restore(m) {
    setBusy(m.id);
    try {
      await api.post(`/api/clubs/${club.id}/members/${m.id}/restore`, { to: to[m.id] || m.review_from || 'guest' });
      changed();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(null);
    }
  }
  async function unblock(b) {
    if (!window.confirm(t('mod.unblockConfirm', { name: b.full_name || b.phone }))) return;
    try {
      await api.del(`/api/clubs/${club.id}/blocks/${b.id}`);
      changed();
    } catch (err) {
      window.alert(err.message);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-gray-500 text-xs">{t('mod.tabHint')}</p>
      {members.length === 0 && <p className="card text-gray-400 text-sm">{t('mod.empty')}</p>}
      {members.map((m) => {
        const left = m.review_until ? daysLeft(m.review_until) : 0;
        return (
          <div key={m.id} className="card !py-3 border-amber-300/40">
            <div className="flex flex-wrap items-start gap-3">
              <Avatar name={m.full_name} size={36} />
              <div className="flex-1 min-w-[12rem]">
                <p className="text-white font-semibold">{m.full_name} <span className="text-gray-400 text-xs font-normal">· {t('mod.wasPlace', { place: t(`mod.place_${m.review_from || 'fixed'}`) })}</span></p>
                <p className="text-amber-200 text-sm">“{m.review_reason}”</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {t('mod.since', { date: fmtDate(m.review_started_at) })} ·{' '}
                  {left > 0 ? t('mod.leftDays', { n: left, date: fmtDate(m.review_until) }) : <span className="text-lime-300">{t('mod.ended')}</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2 w-full sm:w-auto">
                <label className="text-xs text-gray-400 flex flex-col gap-0.5">
                  {t('mod.backAs')}
                  <select className="input !py-1 text-sm" value={to[m.id] || m.review_from || 'guest'} onChange={(e) => setTo((x) => ({ ...x, [m.id]: e.target.value }))}>
                    <option value="fixed">{t('mod.place_fixed')}</option>
                    <option value="guest">{t('mod.place_guest')}</option>
                    <option value="waiting">{t('mod.place_waiting')}</option>
                  </select>
                </label>
                <button className="btn-primary !py-1.5 text-sm" disabled={busy === m.id} onClick={() => restore(m)}>↩ {t('mod.restore')}</button>
                <button className="rounded-lg px-3 py-1.5 text-sm border border-red-500/60 text-red-300 hover:bg-red-500/10" onClick={() => setRemoving(m)}>⛔ {t('mod.remove')}</button>
              </div>
            </div>
          </div>
        );
      })}

      {mod?.blocks?.length > 0 && (
        <section className="card">
          <h3 className="text-white font-semibold mb-1">🚫 {t('mod.blocksTitle')}</h3>
          <ul className="divide-y divide-navy-700">
            {mod.blocks.map((b) => (
              <li key={b.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="text-white">{b.full_name || b.phone}</span>
                  <span className="text-gray-400"> · {t(`mod.blocked_${b.scope}`)} · {fmtDate(b.created_at)}</span>
                  {b.reason && <span className="block text-gray-500 text-xs">“{b.reason}”</span>}
                </span>
                <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => unblock(b)}>{t('mod.unblock')}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3 className="text-white font-semibold">📜 {t('mod.historyTitle')}</h3>
        <p className="text-gray-500 text-xs mb-1">{t('mod.historyHint')}</p>
        {!mod?.rows?.length && <p className="text-gray-500 text-sm">{t('mod.historyEmpty')}</p>}
        <ul className="divide-y divide-navy-700">{(mod?.rows || []).map((r) => <HistoryLine key={r.id} r={r} />)}</ul>
        {mod?.pages > 1 && (
          <div className="flex justify-between mt-2 text-sm">
            <button type="button" className="btn-secondary !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
            <span className="text-gray-400">{page}/{mod.pages}</span>
            <button type="button" className="btn-secondary !py-1" disabled={page >= mod.pages} onClick={() => setPage(page + 1)}>→</button>
          </div>
        )}
      </section>

      <RemoveModal club={club} member={removing} open={!!removing} onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); changed(); }} />
    </div>
  );
}

// Next to a join request: this person's past in the club (removed / reviewed before, blocked).
export function PastWarning({ past }) {
  const { t } = useI18n();
  if (!past) return null;
  const last = past.history?.[0];
  return (
    <div className="mt-1.5 rounded-lg border border-red-500/50 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-100">
      <p className="font-semibold">⚠️ {past.blocked ? t('mod.pastBlocked', { scope: t(`mod.blocked_${past.blocked.scope}`) }) : t('mod.pastTitle')}</p>
      {(past.history || []).slice(0, 3).map((h, i) => (
        <p key={i}>
          {fmtDate(h.created_at)} · {t(`mod.act_${h.action}`, { to: '' })}
          {h.reason ? ` — “${h.reason}”` : ''}
        </p>
      ))}
      {!last && past.blocked?.reason && <p>“{past.blocked.reason}”</p>}
    </div>
  );
}

// Invite link for the club: on/off, copy, make a new one (the old one stops working).
export function InviteModal({ club, open, onClose }) {
  const { t } = useI18n();
  const { updateClub, reload } = useClubs();
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  if (!club) return null;
  const link = `${origin}/invite/${club.invite_token}`;
  const on = !!club.invite_enabled;
  async function toggle() {
    setBusy(true);
    try {
      await updateClub(club.id, { invite_enabled: !on });
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function rotate() {
    if (!window.confirm(t('invite.rotateConfirm'))) return;
    await api.post(`/api/clubs/${club.id}/invite-token/rotate`, {});
    reload();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt(t('invite.link'), link);
    }
  }
  return (
    <Modal open={open} title={`🔗 ${t('invite.title')}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-gray-300 text-sm">{t('invite.intro')}</p>
        <label className="flex items-center gap-2 text-sm text-gray-200">
          <input type="checkbox" checked={on} disabled={busy} onChange={toggle} />
          {t('invite.enable')}
        </label>
        {on && club.invite_token && (
          <>
            <div className="flex gap-2">
              <input readOnly className="input text-sm" value={link} onFocus={(e) => e.target.select()} aria-label={t('invite.link')} />
              <button type="button" className="btn-primary text-sm shrink-0" onClick={copy}>{copied ? t('events.copied') : t('events.copyLink')}</button>
            </div>
            <button type="button" className="self-start text-gray-400 text-xs underline" onClick={rotate}>{t('invite.rotate')}</button>
          </>
        )}
        <p className="text-gray-500 text-xs">{t('invite.note')}</p>
        <button type="button" className="btn-secondary" onClick={onClose}>{t('plan.close')}</button>
      </div>
    </Modal>
  );
}
