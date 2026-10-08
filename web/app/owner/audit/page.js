'use client';
import { useState } from 'react';
import OwnerShell from '@/components/OwnerShell';
import { AuditRow } from '@/components/OwnerAudit';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const ACTIONS = ['', 'subscription.update', 'payment.confirm', 'payment.cancel', 'account.suspend', 'account.unsuspend', 'club.member_addon', 'club.transfer', 'note.add', 'feedback.status', 'announcement.create', 'announcement.update', 'setting.update', 'undo'];

// Every change made in the owner console, newest first. Append-only: entries are
// never edited or deleted; an undo is a new entry.
export default function OwnerAuditPage() {
  const { t } = useI18n();
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, reload } = useLoad(() => api.get(`/api/owner/audit?page=${page}${action ? `&action=${action}` : ''}`), [page, action]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;
  return (
    <OwnerShell title={t('owner.tabAudit')}>
      <p className="text-gray-400 text-sm mb-3">{t('owner.auditHint')}</p>
      <select className="input text-sm max-w-xs mb-3" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label={t('owner.filterAction')}>
        {ACTIONS.map((a) => <option key={a} value={a}>{a ? t(`owner.act_${a.replace('.', '_')}`) : t('owner.allActions')}</option>)}
      </select>
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {data && data.rows.length === 0 && <p className="card text-gray-500 text-sm">{t('owner.noAudit')}</p>}
      {data && data.rows.length > 0 && (
        <ul className="card !py-1 divide-y divide-navy-700">{data.rows.map((r) => <AuditRow key={r.id} row={r} onChanged={reload} />)}</ul>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button type="button" className="btn-secondary !py-1 text-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
          <span className="text-gray-400 text-sm tabular-nums">{page}/{pages}</span>
          <button type="button" className="btn-secondary !py-1 text-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>→</button>
        </div>
      )}
    </OwnerShell>
  );
}
