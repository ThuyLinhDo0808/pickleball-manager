'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { dmy } from '@/lib/coach';

// Hồ sơ Coach → Trợ giảng: invite by email (they take attendance on the sessions; they
// never see money or phone numbers), remove.
export function AssistantsPanel() {
  const { t } = useI18n();
  const { data, reload, error } = useLoad(() => api.get('/api/coach/assistants'), []);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (error?.payload?.code === 'migration_missing') return null;
  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api.post('/api/coach/assistants', { email: email.trim() });
      setEmail('');
      reload();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(a) {
    if (!window.confirm(t('cassist.removeAsk', { email: a.email }))) return;
    setBusy(true);
    try {
      await api.del(`/api/coach/assistants/${a.id}`);
      reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card grid gap-3">
      <div>
        <h2 className="text-white font-semibold">{t('cassist.title')}</h2>
        <p className="text-gray-400 text-sm">{t('cassist.lead')}</p>
      </div>
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input className="input !w-auto flex-1 min-w-[12rem]" type="email" required placeholder={t('cassist.emailPh')} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn-primary" disabled={busy}>{t('cassist.add')}</button>
      </form>
      {msg && <p className="text-red-300 text-sm">{msg}</p>}
      {data && !data.length && <p className="text-gray-500 text-sm">{t('cassist.none')}</p>}
      <ul className="grid gap-1">
        {(data || []).map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm border-b border-navy-700 last:border-b-0 py-1.5">
            <span className="flex-1 min-w-0 text-white break-all">{a.email}<span className="block text-gray-500 text-xs">{a.user_id ? t('cassist.linked') : t('cassist.notYet')} · {dmy(a.created_at?.slice(0, 10))}</span></span>
            <button type="button" disabled={busy} className="text-red-300 hover:text-red-200 text-xs px-2 min-h-[44px]" onClick={() => remove(a)}>{t('cassist.remove')}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Hồ sơ Coach → Đánh giá: what students wrote (the coach reads them; the Ban quản trị can hide one).
export function MyReviewsPanel() {
  const { t } = useI18n();
  const { data, error } = useLoad(() => api.get('/api/coach/reviews'), []);
  if (error?.payload?.code === 'migration_missing' || !data) return null;
  return (
    <section className="card grid gap-2">
      <h2 className="text-white font-semibold">{t('creview.title')} {data.rating != null && <span className="text-amber-200 font-normal text-sm tabular-nums">★ {data.rating} · {t('creview.count', { n: data.count })}</span>}</h2>
      {!data.rows.length && <p className="text-gray-500 text-sm">{t('creview.emptyCoach')}</p>}
      <ul className="grid gap-2">
        {data.rows.map((r) => (
          <li key={r.id} className={`rounded-lg border border-navy-700 px-3 py-2 text-sm ${r.hidden ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-2"><span className="text-amber-200">{'★'.repeat(r.stars)}</span><span className="text-gray-300">{r.name}</span><span className="text-gray-500 text-xs tabular-nums ml-auto">{dmy(r.created_at?.slice(0, 10))}{r.hidden ? ` · ${t('ocoach.hidden')}` : ''}</span></div>
            {r.body && <p className="text-gray-200 mt-1 whitespace-pre-line break-words">{r.body}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
