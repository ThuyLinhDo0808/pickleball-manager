'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { dmy } from '@/lib/memberDates';

// ⚡ Ưu tiên chip for a guest, with their ticket discount (— when none). Guests have
// no VIP: that comes with a membership plan, for fixed members.
export function GuestPerkBadge({ perk, pct }) {
  const { t } = useI18n();
  if (!perk) return <span className="text-gray-500">—</span>;
  return (
    <span className="inline-block whitespace-nowrap text-xs font-semibold rounded border px-1.5 py-0.5 border-sky-400/70 text-sky-300 bg-sky-400/10">
      ⚡ {t('guests.perk_priority')}
      {pct > 0 && <span className="text-lime-300"> −{pct}%</span>}
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

// What the priority perk means for a guest (guests buy single tickets only).
export function GuestPerkSettings() {
  const { t } = useI18n();
  return (
    <div className="card mb-3 !py-3 text-sm flex flex-col gap-1.5">
      <p className="text-white font-semibold">{t('guests.perksTitle')}</p>
      <p className="text-gray-300">
        <GuestPerkBadge perk="priority" /> <span className="ml-1">{t('guests.priorityMeans')}</span>
      </p>
      <p className="text-gray-500 text-xs">{t('guests.perkHowTo')}</p>
    </div>
  );
}
