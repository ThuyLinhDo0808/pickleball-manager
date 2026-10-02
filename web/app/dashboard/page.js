'use client';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PendingPayments from '@/components/PendingPayments';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useClubs } from '@/context/ClubContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { todayYmd, hhmm } from '@/lib/dates';
import { isBirthdayMonth } from '@/lib/memberDates';

const safe = (p) => p.catch(() => null);

function greeting(t) {
  const h = new Date().getHours();
  return t(h < 11 ? 'home.morning' : h < 14 ? 'home.noon' : h < 18 ? 'home.afternoon' : 'home.evening');
}

function Kpi({ icon, label, value, sub, href, tone = 'text-white' }) {
  const body = (
    <div className="card h-full !p-4 flex flex-col gap-1 hover:border-navy-500 transition">
      <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wide">
        <span>{label}</span>
        <span className="text-base" aria-hidden="true">{icon}</span>
      </div>
      <div className={`text-xl sm:text-2xl font-bold tabular-nums whitespace-nowrap ${tone}`}>{value}</div>
      {sub && <div className="text-gray-400 text-xs">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

function Section({ title, action, children }) {
  return (
    <section className="card !p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-navy-700">
        <h2 className="text-white font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

// Club home: who we are, what's next, what needs the Host, and how the club is doing.
export default function DashboardPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { club } = useClubs();
  const cid = club?.id;
  const today = todayYmd();
  const month = today.slice(0, 7);

  const { data: me } = useLoad(() => (user ? safe(api.get('/api/host/me')) : Promise.resolve(null)), [user?.id]);
  const { data: events } = useLoad(() => (cid ? safe(api.get(`/api/clubs/${cid}/events`)) : Promise.resolve([])), [cid]);
  const { data: members } = useLoad(() => (cid ? safe(api.get(`/api/clubs/${cid}/members`)) : Promise.resolve([])), [cid]);
  const { data: fund } = useLoad(() => (cid ? safe(api.get(`/api/clubs/${cid}/fund`)) : Promise.resolve(null)), [cid]);
  const { data: requests } = useLoad(() => (cid ? safe(api.get(`/api/clubs/${cid}/member-requests`)) : Promise.resolve([])), [cid]);
  const { data: stats } = useLoad(() => (cid ? safe(api.get(`/api/clubs/${cid}/stats?period=month&date=${today}&group=club`)) : Promise.resolve(null)), [cid]);

  const ev = (events || []).filter((e) => e.status !== 'cancelled');
  const upcoming = ev.filter((e) => e.event_date >= today && e.status !== 'completed').slice(0, 6);
  const monthEvents = ev.filter((e) => e.event_date.startsWith(month));
  const doneThisMonth = monthEvents.filter((e) => e.event_date < today || e.status === 'completed').length;
  const all = (members || []).filter((m) => m.is_active !== false);
  const fixed = all.filter((m) => m.member_type === 'fixed');
  const guests = all.filter((m) => m.member_type !== 'fixed');
  const newThisMonth = fixed.filter((m) => (m.joined_on || '').startsWith(month)).length;
  const income = (fund?.transactions || [])
    .filter((x) => !x.is_voided && x.type === 'income' && String(x.occurred_on || '').startsWith(month))
    .reduce((s, x) => s + Number(x.amount || 0), 0);
  const debtors = fixed.filter((m) => Number(m.debt) > 0);
  const birthdays = all.filter((m) => isBirthdayMonth(m.birth_date)).sort((a, b) => a.birth_date.slice(8).localeCompare(b.birth_date.slice(8)));
  const usage = me?.usage;
  const name = me?.full_name || user?.email?.split('@')[0] || '';
  const todos = [
    requests?.length ? { href: '/club/members', icon: '📝', text: t('home.todoRequests', { n: requests.length }) } : null,
    debtors.length ? { href: '/club/members', icon: '💸', text: t('home.todoDebt', { n: debtors.length }) } : null,
    upcoming.some((e) => e.pending_count > 0) ? { href: `/events/${upcoming.find((e) => e.pending_count > 0).id}`, icon: '🧾', text: t('home.todoTransfers') } : null,
  ].filter(Boolean);
  const top = stats?.awards;

  return (
    <AppShell>
      {/* Header */}
      <div className="rounded-2xl border border-navy-700 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-5 sm:p-6 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-gray-400 text-sm capitalize">
              {new Date().toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <h1 className="text-white text-2xl sm:text-3xl font-bold mt-1 truncate">
              {greeting(t)}{name ? `, ${name}` : ''} 👋
            </h1>
            {club && (
              <p className="text-gray-300 text-sm mt-1">
                {t(`clubs.sport_${club.sport || 'pickleball'}`)} · <span className="text-lime-300 font-semibold">{club.name}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/events/create" className="btn-primary text-sm">+ {t('nav.createGame')}</Link>
            <Link href="/events/create/weekly" className="btn-secondary text-sm">{t('nav.createWeekly')}</Link>
            <Link href="/club/members" className="btn-secondary text-sm">{t('nav.members')}</Link>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi icon="👥" label={t('home.kpiMembers')} value={fixed.length} sub={t('home.kpiMembersSub', { guests: guests.length, n: newThisMonth })} href="/club/members" />
        <Kpi icon="📅" label={t('home.kpiSessions')} value={monthEvents.length} sub={t('home.kpiSessionsSub', { done: doneThisMonth, left: monthEvents.length - doneThisMonth })} href="/events" />
        <Kpi icon="💰" label={t('home.kpiIncome')} value={formatVnd(income)} tone="text-lime-400" sub={t('home.kpiIncomeSub')} href="/finance" />
        <Kpi icon="🏦" label={t('home.kpiFund')} value={formatVnd(fund?.balance || 0)} sub={debtors.length ? t('home.kpiDebt', { n: debtors.length }) : t('home.kpiNoDebt')} href="/finance/ledger" />
      </div>

      <PendingPayments club={club} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Upcoming sessions */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Section title={t('home.upcoming')} action={<Link href="/events" className="text-lime-400 text-sm">{t('nav.schedule')} →</Link>}>
            {upcoming.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-400 text-sm mb-3">{t('home.noUpcoming')}</p>
                <Link href="/events/create/weekly" className="btn-primary text-sm">{t('nav.createWeekly')}</Link>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-navy-700">
                {upcoming.map((e) => {
                  const d = new Date(`${e.event_date}T00:00:00`);
                  const pct = e.slots ? Math.min(100, Math.round((100 * (e.main_count || 0)) / e.slots)) : 0;
                  return (
                    <li key={e.id}>
                      <Link href={`/events/${e.id}`} className="flex items-center gap-4 py-3 group">
                        <div className={`w-14 shrink-0 rounded-xl text-center py-1.5 ${e.event_date === today ? 'bg-lime-400 text-navy-950' : 'bg-navy-900 text-white'}`}>
                          <div className="text-[10px] uppercase font-semibold opacity-80">{d.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'short' })}</div>
                          <div className="text-xl font-bold leading-6">{d.getDate()}</div>
                          <div className="text-[10px] opacity-80">{t('home.monthShort', { m: d.getMonth() + 1 })}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-white font-semibold truncate group-hover:text-lime-300">{e.title}</div>
                          <div className="text-gray-400 text-xs truncate">
                            {e.start_time ? hhmm(e.start_time) : ''}
                            {e.end_time ? `–${hhmm(e.end_time)}` : ''}
                            {e.location ? ` · ${e.location}` : ''}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="h-1.5 flex-1 max-w-[12rem] rounded-full bg-navy-900 overflow-hidden">
                              <span className="block h-full bg-lime-400" style={{ width: `${pct}%` }} />
                            </span>
                            <span className="text-gray-300 text-xs tabular-nums">{e.main_count || 0}/{e.slots || '∞'}</span>
                            {e.waitlist_count > 0 && <span className="text-sky-300 text-xs">+{e.waitlist_count} {t('home.waiting')}</span>}
                          </div>
                        </div>
                        <span className="text-gray-500 group-hover:text-lime-300" aria-hidden="true">›</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title={t('home.topMonth')} action={<Link href="/club/rankings" className="text-lime-400 text-sm">{t('nav.rankings')} →</Link>}>
            {!top || (!top.top_attendance.length && !top.top_win_rate.length && !top.top_point_diff.length) ? (
              <p className="text-gray-400 text-sm">{t('home.noTop')}</p>
            ) : (
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  ['💪', t('rankings.topAttendance'), top.top_attendance, (v) => t('rankings.sessions', { n: v })],
                  ['🏆', t('rankings.topWinRate'), top.top_win_rate, (v) => `${v}%`],
                  ['📈', t('rankings.topDiff'), top.top_point_diff, (v) => (v > 0 ? `+${v}` : v)],
                ].map(([icon, title, list, fmt]) => (
                  <div key={title} className="rounded-xl bg-navy-900 p-3">
                    <div className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5">{icon} {title}</div>
                    {list.length === 0 ? (
                      <p className="text-gray-500 text-sm">—</p>
                    ) : (
                      list.slice(0, 3).map((r, i) => (
                        <div key={r.club_member_id} className="flex justify-between gap-2 text-sm py-0.5">
                          <span className="truncate text-gray-100">{['🥇', '🥈', '🥉'][i]} {r.full_name}</span>
                          <span className="text-lime-400 font-semibold tabular-nums shrink-0">{fmt(r.value)}</span>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Side column */}
        <div className="flex flex-col gap-4">
          <Section title={t('home.todo')}>
            {todos.length === 0 ? (
              <p className="text-gray-400 text-sm">✅ {t('home.allClear')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {todos.map((x) => (
                  <li key={x.text}>
                    <Link href={x.href} className="flex items-center gap-3 rounded-lg bg-navy-900 px-3 py-2 text-sm text-gray-100 hover:text-lime-300">
                      <span aria-hidden="true">{x.icon}</span>
                      <span className="flex-1">{x.text}</span>
                      <span className="text-gray-500">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`🎂 ${t('home.birthdays')}`}>
            {birthdays.length === 0 ? (
              <p className="text-gray-400 text-sm">{t('home.noBirthdays')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {birthdays.slice(0, 6).map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span className="truncate text-gray-100">{m.full_name}</span>
                    <span className={`tabular-nums shrink-0 ${m.birth_date.slice(5) === today.slice(5) ? 'text-pink-300 font-semibold' : 'text-gray-400'}`}>
                      {m.birth_date.slice(8, 10)}/{m.birth_date.slice(5, 7)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {usage && (
            <Section title={t('home.plan')} action={<Link href="/account" className="text-lime-400 text-sm">{t('nav.account')} →</Link>}>
              <div className="flex justify-between items-baseline gap-2 mb-2">
                <span className="text-white font-bold uppercase">{usage.tier}</span>
                <span className="text-gray-400 text-xs">{t('home.planUsage', { used: usage.used, limit: usage.capacity_limit })}</span>
              </div>
              <div className="w-full bg-navy-900 rounded-full h-2 overflow-hidden">
                <div className="bg-lime-400 h-2 rounded-full" style={{ width: `${Math.min(100, (usage.used / usage.capacity_limit) * 100)}%` }} />
              </div>
              <p className="text-gray-400 text-xs mt-2">{t('home.planLeft', { n: usage.remaining })}</p>
            </Section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
