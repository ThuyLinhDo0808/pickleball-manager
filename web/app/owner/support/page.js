'use client';
import { useState } from 'react';
import OwnerShell, { fmtTime } from '@/components/OwnerShell';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const PERMS = ['stats', 'hosts', 'payments', 'plans', 'feedback', 'announcements', 'promos', 'view_as'];
const PRESETS = {
  helpdesk: ['hosts', 'feedback', 'view_as'],
  billing: ['hosts', 'payments', 'plans', 'promos'],
};

function PermPicker({ value, onChange }) {
  const { t } = useI18n();
  const toggle = (p) => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5 mb-1">
        {Object.entries(PRESETS).map(([k, v]) => (
          <button key={k} type="button" className="rounded-full border border-navy-600 px-3 py-1 text-xs text-gray-300 hover:border-amber-300" onClick={() => onChange(v)}>
            {t(`owner.preset_${k}`)}
          </button>
        ))}
      </div>
      {PERMS.map((p) => (
        <label key={p} className="flex items-start gap-2 rounded-lg border border-navy-700 px-3 py-2 cursor-pointer hover:border-navy-500">
          <input type="checkbox" className="mt-1" checked={value.includes(p)} onChange={() => toggle(p)} />
          <span>
            <span className="text-white text-sm font-semibold">{t(`owner.sp_${p}`)}</span>
            <span className="block text-gray-400 text-xs">{t(`owner.sph_${p}`)}</span>
          </span>
        </label>
      ))}
      <p className="text-gray-500 text-xs mt-1">🔒 {t('owner.supportOwnerOnly')}</p>
    </div>
  );
}

// Support staff: people who help run the app with only some parts of this console.
export default function OwnerSupportPage() {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get('/api/owner/support'), []);
  const [form, setForm] = useState({ email: '', full_name: '', permissions: PRESETS.helpdesk });
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const msgOf = (e) => {
    const c = e.payload?.code;
    return c === 'already_owner' ? t('owner.supportIsOwner') : c === 'already_staff' ? t('owner.supportExists') : e.message;
  };
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.post('/api/owner/support', form);
      setForm({ email: '', full_name: '', permissions: PRESETS.helpdesk });
      reload();
    } catch (x) {
      setErr(msgOf(x));
    } finally {
      setBusy(false);
    }
  };
  const patch = async (s, body) => {
    try {
      await api.patch(`/api/owner/support/${encodeURIComponent(s.email)}`, body);
      setEditing(null);
      reload();
    } catch (x) {
      window.alert(msgOf(x));
    }
  };
  const remove = async (s) => {
    if (!window.confirm(t('owner.supportRemoveAsk', { email: s.email }))) return;
    await api.del(`/api/owner/support/${encodeURIComponent(s.email)}`).catch(() => {});
    reload();
  };
  return (
    <OwnerShell title={t('owner.tabSupport')}>
      <p className="text-gray-400 text-sm mb-4">{t('owner.supportHint')}</p>
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 items-start">
        <form onSubmit={add} className="card !p-4 flex flex-col gap-3">
          <h2 className="text-white font-semibold">➕ {t('owner.supportAdd')}</h2>
          <label className="text-sm text-gray-300">
            Email
            <input className="input mt-1" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="hotro@gmail.com" />
          </label>
          <label className="text-sm text-gray-300">
            {t('owner.supportName')}
            <input className="input mt-1" maxLength={80} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </label>
          <PermPicker value={form.permissions} onChange={(permissions) => setForm({ ...form, permissions })} />
          {err && <p className="text-red-300 text-sm">{err}</p>}
          <button type="submit" className="btn-primary text-sm" disabled={busy}>{t('owner.supportAdd')}</button>
        </form>

        <div>
          {error && <p className="card text-red-300 text-sm">{error.message}</p>}
          {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
          {data && data.staff.length === 0 && <p className="card text-gray-500 text-sm">{t('owner.supportNone')}</p>}
          {data && data.staff.length > 0 && (
            <ul className="flex flex-col gap-2">
              {data.staff.map((s) => (
                <li key={s.email} className={`card !p-3 ${s.active ? '' : 'opacity-60'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-white font-semibold truncate">{s.full_name || s.email}</div>
                      {s.full_name && <div className="text-gray-400 text-xs truncate">{s.email}</div>}
                      <div className="text-gray-500 text-[11px] mt-0.5">
                        {s.has_account ? t('owner.supportLastSeen', { at: fmtTime(s.last_sign_in_at) }) : t('owner.supportNoAccount')}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.active ? 'bg-lime-400/15 text-lime-200' : 'bg-navy-700 text-gray-400'}`}>{s.active ? t('owner.active') : t('owner.supportPaused')}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {s.permissions.length === 0 && <span className="text-gray-500 text-xs">{t('owner.supportNoPerms')}</span>}
                    {s.permissions.map((p) => <span key={p} className="rounded-md bg-navy-900 px-2 py-0.5 text-xs text-gray-200">{t(`owner.sp_${p}`)}</span>)}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setEditing({ ...s })}>✎ {t('owner.supportEditPerms')}</button>
                    <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => patch(s, { active: !s.active })}>{s.active ? `⏸ ${t('owner.supportPause')}` : `▶ ${t('owner.supportResume')}`}</button>
                    <button type="button" className="text-red-400 hover:text-red-300 text-xs px-2 ml-auto" onClick={() => remove(s)}>{t('owner.supportRemove')}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <Modal open={!!editing} title={t('owner.supportEditPerms')} onClose={() => setEditing(null)}>
        {editing && (
          <div className="flex flex-col gap-3">
            <p className="text-gray-300 text-sm">{editing.email}</p>
            <PermPicker value={editing.permissions} onChange={(permissions) => setEditing({ ...editing, permissions })} />
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary text-sm" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
              <button type="button" className="btn-primary text-sm" onClick={() => patch(editing, { permissions: editing.permissions })}>{t('common.save')}</button>
            </div>
          </div>
        )}
      </Modal>
    </OwnerShell>
  );
}
