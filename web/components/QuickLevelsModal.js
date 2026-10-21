'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import Link from 'next/link';

const blank = (label) => ({ label, dupr_min: '', dupr_max: '' });

// The community has no levels yet: make them here (names + DUPR range) without leaving the
// form being filled in. Saved into the control panel (Bảng điều khiển → Trình độ), so the
// rest of the community uses them too.
export default function QuickLevelsModal({ open, clubId, settings: given, sport = 'pickleball', onClose, onSaved }) {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const top = sport === 'badminton' ? 6 : 8;
  // The control panel's settings (loaded here when the caller has none): existing manual
  // levels are edited, never replaced by the starter set.
  const [settings, setSettings] = useState(given || null);
  useEffect(() => {
    if (!open) return;
    setErr('');
    const start = (st) => {
      setSettings(st);
      const lv = st?.levels;
      setItems(lv?.mode === 'manual' && lv.items?.length ? lv.items.map((it) => ({ ...it, dupr_min: it.dupr_min ?? '', dupr_max: it.dupr_max ?? '' })) : ['A', 'B', 'C'].map((l) => blank(`Series ${l}`)));
    };
    if (given) start(given);
    else api.get(`/api/clubs/${clubId}/community-settings`).then((r) => start(r.settings)).catch(() => start(null));
  }, [open, given, clubId]);
  const otherMode = settings?.levels && !['none', 'manual'].includes(settings.levels.mode);
  const setItem = (i, patch) => setItems(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));

  async function save() {
    setBusy(true);
    setErr('');
    try {
      const rows = items.filter((it) => it.label.trim());
      const r = await api.put(`/api/clubs/${clubId}/community-settings`, { ...(settings || {}), levels: { ...(settings?.levels || {}), mode: 'manual', by_gender: !!settings?.levels?.by_gender, items: rows } });
      onSaved?.(r.settings);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={`🎚 ${t('quickfix.levelsTitle')}`} onClose={onClose}>
      <p className="text-gray-400 text-sm mb-3">{t('quickfix.levelsHint')}</p>
      {otherMode ? (
        <p className="text-amber-200 text-sm">{t('quickfix.levelsOtherMode')} <Link href="/club/community-settings" className="underline text-lime-300">{t('cpanel.title')}</Link></p>
      ) : (
      <>
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_2rem] gap-2 text-xs text-gray-400 mb-1">
        <span>{t('quickfix.levelName')}</span>
        <span>{t('quickfix.levelFrom')}</span>
        <span>{t('quickfix.levelTo')}</span>
        <span />
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_2rem] gap-2 items-center">
            <input className="input" maxLength={30} value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} aria-label={t('quickfix.levelName')} />
            <input className="input text-center" type="number" step={sport === 'badminton' ? 1 : 0.05} min={0} max={top} placeholder="—" value={it.dupr_min} onChange={(e) => setItem(i, { dupr_min: e.target.value })} aria-label={t('quickfix.levelFrom')} />
            <input className="input text-center" type="number" step={sport === 'badminton' ? 1 : 0.05} min={0} max={top} placeholder="—" value={it.dupr_max} onChange={(e) => setItem(i, { dupr_max: e.target.value })} aria-label={t('quickfix.levelTo')} />
            <button type="button" className="text-gray-400 hover:text-red-300" onClick={() => setItems(items.filter((_, k) => k !== i))} aria-label={t('common.delete')}>✕</button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-secondary text-sm mt-2" disabled={items.length >= 12} onClick={() => setItems([...items, blank('')])}>＋ {t('quickfix.levelAdd')}</button>
      {err && <p className="text-red-400 text-sm mt-2">{err}</p>}
      <div className="flex justify-end mt-4">
        <button type="button" className="btn-primary max-sm:w-full sm:px-8" disabled={busy || !items.some((it) => it.label.trim())} onClick={save}>{t('common.save')}</button>
      </div>
      </>
      )}
    </Modal>
  );
}
