'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { dmy } from '@/lib/memberDates';

const PERK_STYLE = {
  vip: 'border-amber-400/70 text-amber-300 bg-amber-400/10',
  priority: 'border-sky-400/70 text-sky-300 bg-sky-400/10',
};

// ⭐ VIP / ⚡ Ưu tiên chip for a guest (— when none).
export function GuestPerkBadge({ perk }) {
  const { t } = useI18n();
  if (!perk) return <span className="text-gray-500">—</span>;
  return (
    <span className={`inline-block whitespace-nowrap text-xs font-semibold rounded border px-1.5 py-0.5 ${PERK_STYLE[perk]}`}>
      {perk === 'vip' ? '⭐ ' : '⚡ '}
      {t(`guests.perk_${perk}`)}
    </span>
  );
}

// Host's note on a guest, editable in place, plus a red chip when they cancelled after paying.
export function GuestNoteCell({ club, member, onSaved }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(member.notes || '');
  const [busy, setBusy] = useState(false);
  const s = member.guest_stats;

  useEffect(() => setText(member.notes || ''), [member.notes]);

  async function save() {
    if ((member.notes || '') === text.trim()) return setEditing(false);
    setBusy(true);
    try {
      await api.patch(`/api/clubs/${club.id}/members/${member.id}`, { notes: text });
      setEditing(false);
      onSaved();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 min-w-0">
      {s?.paid_cancels > 0 && (
        <span className="self-start text-[11px] leading-4 rounded border border-red-400/60 text-red-300 px-1" title={t('guests.paidCancelHint')}>
          {t('guests.paidCancels', { n: s.paid_cancels, date: dmy(s.last_cancel).slice(0, 5) })}
        </span>
      )}
      {editing ? (
        <textarea
          className="input !py-1 text-sm min-h-[3.5rem]"
          autoFocus
          maxLength={2000}
          value={text}
          disabled={busy}
          placeholder={t('guests.notePlaceholder')}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              save();
            }
            if (e.key === 'Escape') {
              setText(member.notes || '');
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={`text-left text-sm rounded px-1 -mx-1 hover:bg-navy-700 ${member.notes ? 'text-gray-200' : 'text-gray-500'}`}
          onClick={() => setEditing(true)}
        >
          {member.notes || `+ ${t('guests.addNote')}`}
        </button>
      )}
    </div>
  );
}

// What the perks mean, and the VIP discount for this club (owner can change it).
export function GuestPerkSettings({ club }) {
  const { t } = useI18n();
  const [discount, setDiscount] = useState('');
  const [saved, setSaved] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get(`/api/clubs/${club.id}`)
      .then((c) => {
        if (!live) return;
        const d = Number(c.guest_vip_discount || 0);
        setSaved(d);
        setDiscount(String(d));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [club.id]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const c = await api.patch(`/api/clubs/${club.id}`, { guest_vip_discount: Number(discount || 0) });
      setSaved(Number(c.guest_vip_discount || 0));
      setMsg(t('guests.saved'));
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="card mb-3 !py-3 text-sm flex flex-col gap-2">
      <p className="text-white font-semibold">{t('guests.perksTitle')}</p>
      <div className="grid sm:grid-cols-2 gap-2">
        <p className="text-gray-300">
          <GuestPerkBadge perk="priority" /> <span className="ml-1">{t('guests.priorityMeans')}</span>
        </p>
        <p className="text-gray-300">
          <GuestPerkBadge perk="vip" />{' '}
          <span className="ml-1">{t('guests.vipMeans', { amount: formatVnd(saved || 0) })}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="vip-discount" className="text-gray-400 text-xs">{t('guests.vipDiscount')}</label>
        <input
          id="vip-discount"
          className="input !w-32 !py-1"
          type="number"
          min="0"
          step="1000"
          inputMode="numeric"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />
        <button className="btn-secondary !py-1 text-sm" disabled={busy || String(saved) === discount}>{t('common.save')}</button>
        {msg && <span className="text-xs text-gray-400">{msg}</span>}
      </div>
      <p className="text-gray-500 text-xs">{t('guests.perkHowTo')}</p>
    </form>
  );
}
