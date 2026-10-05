'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
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
    let created;
    try {
      created = await api.post('/api/events', {
        ...eventPayload(f),
        club_id: isClub ? club?.id || null : null,
        ...(dates ? { dates } : {}),
      });
    } catch (err) {
      if (err.payload?.code === 'social_manager_required') throw new Error(t('plan.smRequired'));
      throw err;
    }
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
      <PageHeader
        icon={weekly ? '🔁' : '🏓'}
        title={weekly ? t('nav.createWeekly') : t('nav.createGame')}
        subtitle={isClub && club ? t('create.forClub', { name: club.name }) : t('finX.scopeXeve')}
        actions={<Link href="/events" className="btn-secondary text-sm">🗓 {isClub ? t('nav.schedule') : t('nav.kevents')}</Link>}
      />
      <SectionTabs group="activities" />
      <p className="text-gray-400 text-sm mb-4 rounded-xl border border-navy-700 bg-navy-900/40 px-4 py-2.5">💡 {weekly ? t('weekly.intro') : t('create.gameIntro')}</p>
      {initial && (
        <EventForm
          initial={initial}
          onSubmit={create}
          submitLabel={weekly ? t('weekly.submit') : t('create.submit')}
          showRepeat={false}
          dateField={weekly ? <WeeklyDates value={plan} onChange={setPlan} /> : null}
          kinds={weekly ? null : isClub ? GAME_KINDS : GAME_KINDS.filter((k) => k !== 'meeting')}
          disabled={isClub && !club}
          lockTitle={weekly}
          sessions={weekly ? weeklyDates(plan).length : null}
        />
      )}
    </AppShell>
  );
}
