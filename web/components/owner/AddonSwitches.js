'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

export const ADDON_KEYS = ['finance_pro', 'coach_manager', 'tournament_manager'];

// Owner: switch a paid feature on / off for one Host. On = the Host's pages show it
// instead of locking it (Phân tích tài chính, Giải đấu…). Every change is in the audit log.
export default function AddonSwitches({ hostId, value = {}, onChanged }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  async function flip(addon) {
    const enabled = !value[addon];
    if (!window.confirm(t(enabled ? 'addons.onAsk' : 'addons.offAsk', { name: t(`addons.n_${addon}`) }))) return;
    setBusy(addon);
    setMsg('');
    try {
      await api.put(`/api/owner/hosts/${hostId}/addons/${addon}`, { enabled });
      await onChanged?.();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      {ADDON_KEYS.map((a) => (
        <div key={a} className="flex items-center justify-between gap-3 rounded-lg bg-navy-900/60 px-3 py-2">
          <span className="text-sm text-gray-200 min-w-0">{t(`addons.n_${a}`)}</span>
          <button
            type="button"
            role="switch"
            aria-checked={!!value[a]}
            aria-label={t(`addons.n_${a}`)}
            disabled={!!busy}
            onClick={() => flip(a)}
            className={`shrink-0 relative h-6 w-11 rounded-full transition-colors ${value[a] ? 'bg-lime-400' : 'bg-navy-600'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value[a] ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      ))}
      {msg && <p className="text-red-400 text-xs">{msg}</p>}
    </div>
  );
}
