'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import EventForm, { GAME_KINDS, blankEvent, eventPayload } from '@/components/EventForm';
import WeeklyDates, { MAX_SESSIONS, blankWeekly, weeklyDates } from '@/components/WeeklyDates';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { api } from '@/lib/api';

// Two create pages share this: the club's weekly play schedule (repeats N weeks)
// and a one-off "kèo" (game, training, meeting, or a win/lose challenge).
export default function CreateEventView({ weekly = false }) {
  const { t } = useI18n();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { club } = useDefaultClub();
  const isClub = workspace === 'club';
  // ?date=YYYY-MM-DD pre-fills the day
  const [initial, setInitial] = useState(null);
  const [plan, setPlan] = useState(blankWeekly);
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get('date');
    const base = blankEvent(/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : undefined, weekly ? 'weekly' : 'game');
    setInitial(weekly ? { ...base, title: t('weekly.titleDefault') } : base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekly]);

  async function create(f) {
    let dates;
    if (weekly) {
      dates = weeklyDates(plan);
      if (!dates.length) throw new Error(t('weekly.needDates'));
      if (dates.length > MAX_SESSIONS) throw new Error(t('weekly.tooMany', { max: MAX_SESSIONS }));
    }
    const created = await api.post('/api/events', {
      ...eventPayload(f),
      club_id: isClub ? club?.id || null : null,
      ...(dates ? { dates } : {}),
    });
    // One event: open it so the Host can share the link. Several: back to the calendar.
    router.push(created.created_count > 1 ? '/events' : `/events/${created.id}`);
  }

  if (weekly && workspace && !isClub) {
    return (
      <AppShell>
        <p className="text-gray-400">{t('weekly.clubOnly')}</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-white text-2xl font-bold">{weekly ? t('nav.createWeekly') : t('nav.createGame')}</h1>
        <Link href="/events" className="text-gray-400 text-sm hover:text-white shrink-0">← {isClub ? t('nav.schedule') : t('nav.kevents')}</Link>
      </div>
      <p className="text-gray-400 text-sm mb-4">
        {weekly ? t('weekly.intro') : t('create.gameIntro')}
        {isClub && club && <> · {t('create.forClub', { name: club.name })}</>}
      </p>
      {initial && (
        <EventForm
          initial={initial}
          onSubmit={create}
          submitLabel={weekly ? t('weekly.submit') : t('create.submit')}
          showRepeat={false}
          dateField={weekly ? <WeeklyDates value={plan} onChange={setPlan} /> : null}
          kinds={weekly ? null : GAME_KINDS}
          disabled={isClub && !club}
          lockTitle={weekly}
        />
      )}
    </AppShell>
  );
}
