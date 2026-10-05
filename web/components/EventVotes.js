'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const TONE = {
  yes: 'bg-lime-400 text-navy-950 border-lime-400',
  no: 'bg-red-500 text-white border-red-500',
};

// A club meeting: who votes to come, who doesn't, who hasn't answered. Members vote on
// their club page; the Host can also mark a vote (e.g. told in the group chat).
export default function EventVotes({ event }) {
  const { t } = useI18n();
  const { data, setData, loading } = useLoad(() => api.get(`/api/events/${event.id}/votes`), [event.id]);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');

  async function mark(memberId, current, choice) {
    setError('');
    try {
      setData(await api.put(`/api/events/${event.id}/votes/${memberId}`, { choice: current === choice ? null : choice }));
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading && !data) return <p className="card text-gray-400 text-sm mb-4">{t('common.loading')}</p>;
  if (!data) return null;
  const rows = data.members.filter((m) => filter === 'all' || (filter === 'none' ? !m.choice : m.choice === filter));
  const total = data.members.length || 1;

  return (
    <section className="card mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-white font-semibold">🗳 {t('meeting.votesTitle')}</h2>
        <span className="text-gray-400 text-xs">{t('meeting.votesHint')}</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-navy-700 mb-2" aria-hidden="true">
        <span className="bg-lime-400" style={{ width: `${(100 * data.yes) / total}%` }} />
        <span className="bg-red-500" style={{ width: `${(100 * data.no) / total}%` }} />
      </div>
      <div className="flex flex-wrap gap-2 mb-3 text-sm">
        {[
          ['all', `${t('meeting.all')} · ${data.members.length}`, 'text-gray-200'],
          ['yes', `✓ ${t('meeting.yes')} · ${data.yes}`, 'text-lime-300'],
          ['no', `✗ ${t('meeting.no')} · ${data.no}`, 'text-red-300'],
          ['none', `… ${t('meeting.none')} · ${data.none}`, 'text-gray-400'],
        ].map(([k, label, tone]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 ${tone} ${filter === k ? 'border-lime-400 bg-lime-400/10' : 'border-navy-600'}`}>
            {label}
          </button>
        ))}
      </div>
      {Number(event.fee_amount) > 0 && data.yes > 0 && (
        <p className="text-gray-300 text-sm mb-2">{t('meeting.feeTotal', { n: data.yes, v: (Number(event.fee_amount) * data.yes).toLocaleString('vi-VN') })}</p>
      )}
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      <ul className="divide-y divide-navy-700">
        {rows.map((m) => (
          <li key={m.club_member_id} className="flex items-center gap-2 py-1.5 text-sm">
            <span className="flex-1 min-w-0 truncate text-white">
              {m.full_name}
              {m.member_type !== 'fixed' && <span className="text-gray-500 text-xs"> · {t('members.guest')}</span>}
              {m.by_host && m.choice && <span className="text-gray-500 text-xs"> · {t('meeting.byHost')}</span>}
            </span>
            {['yes', 'no'].map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={m.choice === c}
                onClick={() => mark(m.club_member_id, m.choice, c)}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${m.choice === c ? TONE[c] : 'border-navy-600 text-gray-400 hover:text-white'}`}
              >
                {c === 'yes' ? `✓ ${t('meeting.yes')}` : `✗ ${t('meeting.no')}`}
              </button>
            ))}
          </li>
        ))}
        {!rows.length && <li className="py-2 text-gray-500 text-sm">—</li>}
      </ul>
    </section>
  );
}
