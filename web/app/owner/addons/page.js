'use client';
import { useState } from 'react';
import Link from 'next/link';
import OwnerShell, { fmtTime } from '@/components/OwnerShell';
import AddonSwitches from '@/components/owner/AddonSwitches';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const TONE = { open: 'bg-sky-400/20 text-sky-200', approved: 'bg-lime-400/20 text-lime-200', rejected: 'bg-red-500/20 text-red-200', cancelled: 'bg-navy-700 text-gray-400' };

// Owner: Tính năng theo Host — what Hosts asked for in Liên hệ nhà phát triển (approve =
// switch it on for them) and every Host that has a paid feature switched on.
export default function OwnerAddons() {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get('/api/owner/addons'), []);
  const [filter, setFilter] = useState('open');
  const [busy, setBusy] = useState(false);

  async function act(r, action) {
    let note = '';
    if (action === 'reject') {
      note = window.prompt(t('addons.rejectAsk'));
      if (note === null || !note.trim()) return;
    } else if (!window.confirm(t('addons.approveAsk', { name: t(`addons.n_${r.kind}`), email: r.host_email || '—' }))) return;
    setBusy(true);
    try {
      await api.post(`/api/owner/addons/requests/${r.id}/${action}`, { note });
      await reload();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy(false);
    }
  }
  const rows = (data?.requests || []).filter((r) => filter === 'all' || r.status === 'open');

  return (
    <OwnerShell>
      <h1 className="text-white text-2xl font-bold mb-1">🧩 {t('addons.title')}</h1>
      <p className="text-gray-400 text-sm mb-4">{t('addons.sub')}</p>
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
        <section>
          <div className="flex gap-2 mb-3">
            {['open', 'all'].map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-sm ${filter === f ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-navy-800 text-gray-300'}`}>{t(`addons.f_${f}`)}</button>
            ))}
          </div>
          {data && rows.length === 0 && <p className="card text-gray-400 text-sm">{t('addons.none')}</p>}
          <div className="flex flex-col gap-3">
            {rows.map((r) => (
              <div key={r.id} className="card !p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold">{t(`addons.n_${r.kind}`)} <span className={`ml-1 text-[11px] rounded-full px-2 py-0.5 ${TONE[r.status]}`}>{t(`addons.st_${r.status}`)}</span></p>
                    <p className="text-gray-400 text-xs break-all">
                      <Link href={`/owner/hosts/${r.host_id}`} className="text-sky-300 hover:text-lime-300">{r.host_email || '—'}</Link>
                      {r.club_name ? ` · ${r.club_name}` : ''} · {fmtTime(r.created_at)}
                    </p>
                    {r.note && <p className="text-gray-200 text-sm mt-1 whitespace-pre-line">💬 {r.note}</p>}
                    {r.owner_note && <p className="text-gray-400 text-xs mt-1">📝 {r.owner_note}</p>}
                  </div>
                  {r.status === 'open' && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-secondary !py-1.5 text-sm text-red-300" disabled={busy} onClick={() => act(r, 'reject')}>{t('addons.reject')}</button>
                      <button type="button" className="btn-primary !py-1.5 text-sm" disabled={busy} onClick={() => act(r, 'approve')}>✓ {t('addons.approve')}</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card !p-4">
          <h2 className="text-white font-semibold mb-1">✅ {t('addons.onTitle')}</h2>
          <p className="text-gray-400 text-xs mb-3">{t('addons.onHint')}</p>
          {data && data.hosts.length === 0 && <p className="text-gray-500 text-sm">{t('addons.noHosts')}</p>}
          <ul className="flex flex-col gap-4">
            {(data?.hosts || []).map((h) => (
              <li key={h.host_id}>
                <Link href={`/owner/hosts/${h.host_id}`} className="text-sky-300 hover:text-lime-300 text-sm break-all">{h.email || h.host_id}</Link>
                <div className="mt-1"><AddonSwitches hostId={h.host_id} value={h.addons} onChanged={reload} /></div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </OwnerShell>
  );
}
