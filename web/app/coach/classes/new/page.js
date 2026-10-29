'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import Hint from '@/components/ui/Hint';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { CoachGate } from '@/components/coach/CoachGate';
import ClassForm, { emptyClass, classBody } from '@/components/coach/ClassForm';

// Tạo lớp: a repeating class writes one session per weekday in the range; a single
// session is one date. The court and map come from the coach profile unless changed.
export default function NewClassPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { data: me, error, reload } = useLoad(() => api.get('/api/coach/me'), []);
  const [f, setF] = useState(() => emptyClass(null));
  useEffect(() => {
    if (me) setF((x) => ({ ...x, court_name: x.court_name || me.court_name || '', map_url: x.map_url || me.map_url || '' }));
  }, [me]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const cls = await api.post('/api/coach/classes', classBody(f, true));
      router.push(`/coach/classes/${cls.id}`);
    } catch (err) {
      const code = err.payload?.code;
      setMsg(t(`coach.err_${code}`) === `coach.err_${code}` ? err.message : t(`coach.err_${code}`));
      setBusy(false);
    }
  }
  return (
    <AppShell>
      <CoachGate error={error} reload={reload}>
        <PageHeader icon="plans" title={t('coach.classNew')} subtitle={t('coach.classNewLead')} hint={<Hint inline text={t('coach.classNewHint')} />} />
        <form onSubmit={save} className="grid gap-4">
          <ClassForm value={f} onChange={setF} creating />
          {msg && <p className="text-red-300 text-sm">{msg}</p>}
          <div className="flex justify-end gap-2">
            <Link href="/coach/classes" className="btn-secondary">{t('common.cancel')}</Link>
            <button className="btn-primary" disabled={busy}>{t('coach.classCreateCta')}</button>
          </div>
        </form>
      </CoachGate>
    </AppShell>
  );
}
