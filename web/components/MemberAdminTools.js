'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import Hint from '@/components/ui/Hint';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { readMemberFile } from '@/lib/memberImport';

// "+ Thêm thành viên": the Host types a person in (a regular without an account yet). Same
// phone or DUPR ID already in the club -> "already here", with a button to open that person.
export function AddMemberModal({ club, open, onClose, onAdded, onOpenMember }) {
  const { t } = useI18n();
  const community = club?.kind === 'community';
  const pickleball = (club?.sport || 'pickleball') === 'pickleball';
  const blank = { full_name: '', phone: '', gender: '', birth_date: '', dupr_id: '', member_type: community ? 'new' : 'fixed' };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dup, setDup] = useState(null);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const types = community ? ['fixed', 'new', 'guest'] : ['fixed', 'guest'];
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setDup(null);
    try {
      const body = { full_name: f.full_name.trim(), phone: f.phone.trim() || null, gender: f.gender || null, member_type: f.member_type === 'new' ? 'guest' : f.member_type };
      if (f.birth_date) body.birth_date = f.birth_date;
      if (pickleball && f.dupr_id.trim()) body.dupr_id = f.dupr_id.trim();
      const m = await api.post(`/api/clubs/${club.id}/members`, body);
      // Community "Người mới": a drop-in for their first 30 days.
      if (f.member_type === 'new') await api.patch(`/api/clubs/${club.id}/members/${m.id}`, { member_type: 'new' }).catch(() => {});
      setF(blank);
      onAdded?.(m);
    } catch (x) {
      if (x.payload?.code === 'duplicate') setDup(x.payload.member);
      else setErr(x.payload?.code === 'bad_dupr_id' ? t('madmin.badDupr') : x.message);
    } finally {
      setBusy(false);
    }
  }
  if (!open) return null;
  return (
    <Modal open title={t('madmin.addTitle')} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <p className="col-span-2 text-gray-400 text-sm">{t('madmin.addLead')}</p>
        <label className="col-span-2 text-xs text-gray-400">{t('common.name')} *
          <input className="input mt-1" required maxLength={120} value={f.full_name} onChange={(e) => set({ full_name: e.target.value })} />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-gray-400">{t('common.phone')}
          <input className="input mt-1" inputMode="tel" maxLength={30} value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        </label>
        {pickleball && (
          <label className="col-span-2 sm:col-span-1 text-xs text-gray-400">DUPR ID
            <input className="input mt-1 uppercase" maxLength={12} value={f.dupr_id} onChange={(e) => set({ dupr_id: e.target.value })} />
          </label>
        )}
        <label className="col-span-2 sm:col-span-1 text-xs text-gray-400">{t('members.gender')}
          <select className="input mt-1" value={f.gender} onChange={(e) => set({ gender: e.target.value })}>
            <option value="">—</option>
            <option value="male">{t('members.male')}</option>
            <option value="female">{t('members.female')}</option>
          </select>
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-gray-400">{t('members.birthDate')}
          <input className="input mt-1" type="date" value={f.birth_date} onChange={(e) => set({ birth_date: e.target.value })} />
        </label>
        <div className="col-span-2">
          <span className="text-xs text-gray-400">{t('madmin.type')}</span>
          <div className={`grid gap-2 mt-1 ${types.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`} role="radiogroup">
            {types.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={f.member_type === k} onClick={() => set({ member_type: k })} className={`min-h-[44px] rounded-lg border px-2 text-sm ${f.member_type === k ? 'border-lime-400 bg-lime-400/15 text-lime-200 font-semibold' : 'border-navy-600 text-gray-300'}`}>
                {t(`madmin.type_${community ? 'c_' : ''}${k}`)}
              </button>
            ))}
          </div>
        </div>
        {dup && (
          <div className="col-span-2 rounded-lg border border-amber-300/50 bg-amber-300/5 p-3 text-sm text-amber-100 flex flex-wrap items-center justify-between gap-2">
            <span>{t('madmin.dup', { name: dup.full_name })}</span>
            {onOpenMember && <button type="button" className="btn-secondary text-sm" onClick={() => onOpenMember(dup.id)}>{t('madmin.openDup')}</button>}
          </div>
        )}
        {err && <p className="col-span-2 text-red-400 text-sm">{err}</p>}
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={busy || !f.full_name.trim()}>{t('madmin.addBtn')}</button>
        </div>
      </form>
    </Modal>
  );
}

const REASON = { no_name: 'madmin.r_noName', bad_dupr_id: 'madmin.r_badDupr', twice_in_file: 'madmin.r_twice' };

// "Tải lên DS": the member Excel ("Xuất Excel" / the template) -> preview -> import.
export function ImportMembersModal({ club, open, onClose, onDone, onTemplate }) {
  const { t } = useI18n();
  const [rows, setRows] = useState(null);
  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const reset = () => {
    setRows(null);
    setPreview(null);
    setFileName('');
    setErr('');
    setDone(null);
  };
  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    reset();
    setFileName(file.name);
    setBusy(true);
    try {
      const r = await readMemberFile(file);
      if (r.missingName) throw new Error(t('madmin.noHeader'));
      if (!r.rows.length) throw new Error(t('madmin.noRows'));
      setRows(r.rows);
      setPreview(await api.post(`/api/clubs/${club.id}/members/import`, { rows: r.rows, dry_run: true }));
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    setBusy(true);
    setErr('');
    try {
      const r = await api.post(`/api/clubs/${club.id}/members/import`, { rows });
      setDone(r);
      onDone?.();
    } catch (x) {
      setErr(x.payload?.code === 'plan_limit' || x.status === 402 ? t('madmin.overLimit') : x.message);
    } finally {
      setBusy(false);
    }
  }
  if (!open) return null;
  const close = () => {
    reset();
    onClose();
  };
  return (
    <Modal open title={t('madmin.importTitle')} onClose={close}>
      {!done ? (
        <div className="flex flex-col gap-3">
          <p className="text-gray-300 text-sm inline-flex items-start gap-1">{t('madmin.importLead')} <Hint inline text={t('madmin.importHint')} /></p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="text-lime-300 text-sm underline underline-offset-2 min-h-[44px]" onClick={onTemplate}>{t('madmin.template')}</button>
            <label className="btn-primary text-sm cursor-pointer">
              {fileName ? t('madmin.otherFile') : t('madmin.chooseFile')}
              <input type="file" accept=".xlsx" className="sr-only" onChange={pick} disabled={busy} />
            </label>
          </div>
          {fileName && <p className="text-gray-400 text-xs break-all">{fileName}</p>}
          {busy && !preview && <div className="h-20 rounded-lg bg-navy-800 animate-pulse" aria-hidden />}
          {preview && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-navy-600 p-2"><div className="text-lime-300 text-xl font-bold tabular-nums">{preview.create}</div><div className="text-gray-400 text-xs">{t('madmin.willAdd')}</div></div>
                <div className="rounded-lg border border-navy-600 p-2"><div className="text-sky-200 text-xl font-bold tabular-nums">{preview.update}</div><div className="text-gray-400 text-xs">{t('madmin.willUpdate')}</div></div>
                <div className="rounded-lg border border-navy-600 p-2"><div className={`text-xl font-bold tabular-nums ${preview.skip.length ? 'text-amber-200' : 'text-gray-500'}`}>{preview.skip.length}</div><div className="text-gray-400 text-xs">{t('madmin.willSkip')}</div></div>
              </div>
              <ul className="max-h-56 overflow-y-auto rounded-lg border border-navy-700 divide-y divide-navy-700 text-sm">
                {preview.rows.map((r) => (
                  <li key={`r${r.line}`} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="text-white break-words"><span className="text-gray-500 tabular-nums mr-2">{t('madmin.line', { n: r.line })}</span>{r.name}</span>
                    <span className={`text-xs shrink-0 ${r.action === 'create' ? 'text-lime-300' : 'text-sky-200'}`}>{t(r.action === 'create' ? 'madmin.tagNew' : 'madmin.tagUpdate')}</span>
                  </li>
                ))}
                {preview.skip.map((r) => (
                  <li key={`s${r.line}`} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="text-gray-400 break-words"><span className="text-gray-500 tabular-nums mr-2">{t('madmin.line', { n: r.line })}</span>{r.name || '—'}</span>
                    <span className="text-xs text-amber-200 shrink-0">{t(REASON[r.reason] || 'madmin.r_other')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={close}>{t('common.cancel')}</button>
            <button type="button" className="btn-primary" disabled={busy || !preview || preview.create + preview.update === 0} onClick={run}>{t('madmin.importBtn', { n: (preview?.create || 0) + (preview?.update || 0) })}</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-white">{t('madmin.importDone', { add: done.create, upd: done.update })}</p>
          {done.skip.length > 0 && <p className="text-amber-200 text-sm">{t('madmin.importSkipped', { n: done.skip.length })}</p>}
          <div className="flex justify-end"><button type="button" className="btn-primary" onClick={close}>{t('common.close')}</button></div>
        </div>
      )}
    </Modal>
  );
}
