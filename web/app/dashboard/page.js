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
import { levelText } from '@/lib/levels';

const safe = (p) => p.catch(() => null);

function greeting(t) {
  const h = new Date().getHours();
  return t(h < 11 ? 'home.morning' : h < 14 ? 'home.noon' : h < 18 ? 'home.afternoon' : 'home.evening');
}

// A KPI card. The card itself is not a link (easy to tap by accident while scrolling);
// a small "Chi tiết →" at the bottom opens the page behind it.
function Kpi({ icon, label, value, sub, href, tone = 'text-white', lines = null }) {
  const { t } = useI18n();
  return (
    <div className="card h-full !p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wide">
        <span>{label}</span>
        <span className="text-base" aria-hidden="true">{icon}</span>
      </div>
      <div className={`text-xl sm:text-2xl font-bold tabular-nums whitespace-nowrap ${tone}`}>{value}</div>
      {sub && <div className="text-gray-400 text-xs">{sub}</div>}
      {lines && (
        <dl className="mt-1.5 pt-1.5 border-t border-navy-700 grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 text-xs">
          {lines.map(([k, v, tone2]) => (
            <div key={k} className="contents">
              <dt className="text-gray-400 truncate">{k}</dt>
              <dd className={`text-right tabular-nums font-semibold ${tone2 || 'text-gray-100'}`}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {href && (
        <Link href={href} className="mt-auto pt-2 self-end text-lime-400 hover:text-lime-300 text-xs font-semibold">
          {t('home.details')} →
        </Link>
      )}
    </div>
  );
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
  const { data: fin } = useLoad(() => (cid ? safe(api.get(`/api/analytics/finance?club_id=${cid}&months=3`)) : Promise.resolve(null)), [cid]);
  const { data: tours } = useLoad(() => (cid ? safe(api.get(`/api/tournaments?club_id=${cid}`)) : Promise.resolve([])), [cid]);
  const { data: stats } = useLoad(() => (cid ? safe(api.get(`/api/clubs/${cid}/stats?period=month&date=${today}&group=club`)) : Promise.resolve(null)), [cid]);

  const ev = (events || []).filter((e) => e.status !== 'cancelled');
  const upcoming = ev.filter((e) => e.event_date >= today && e.status !== 'completed').slice(0, 6);
  const monthEvents = ev.filter((e) => e.event_date.startsWith(month));
  const doneThisMonth = monthEvents.filter((e) => e.event_date < today || e.status === 'completed').length;
  const all = (members || []).filter((m) => m.is_active !== false);
  const fixed = all.filter((m) => m.member_type === 'fixed');
  const guests = all.filter((m) => m.member_type !== 'fixed');
  const newThisMonth = fixed.filter((m) => (m.joined_on || '').startsWith(month)).length;
  // Money this month (club fund + the club's sessions), and what is still to collect.
  const thisMonth = (fin?.months || []).find((r) => r.month === month) || { income: 0, expense: 0 };
  const debtors = fixed.filter((m) => Number(m.debt) > 0).sort((a, b) => Number(b.debt) - Number(a.debt));
  const owed = debtors.reduce((s, m) => s + Number(m.debt || 0), 0);
  // Who is who: VIP plans and priority guests.
  const vip = fixed.filter((m) => m.vip_stars > 0 || m.tier === 'vip').length;
  const priority = guests.filter((m) => m.guest_perk).length;
  // The year's schedule: regular sessions played / planned, tournaments, games (kèo).
  const year = today.slice(0, 4);
  const yearEv = ev.filter((e) => e.event_date.startsWith(year));
  const weeklyYear = yearEv.filter((e) => e.kind === 'weekly');
  const weeklyDone = weeklyYear.filter((e) => e.event_date < today || e.status === 'completed').length;
  const toursYear = (tours || []).filter((x) => String(x.event_date || x.created_at || '').startsWith(year)).length;
  const gamesYear = yearEv.filter((e) => e.kind && e.kind !== 'weekly').length;
  // Levels: how many have one, and the average by gender. (Rank A–D lives in each
  // tournament, not on the member.)
  const rated = all.filter((m) => m.dupr_level != null && m.dupr_level !== '').length;
  const avg = (g) => {
    const xs = all.filter((m) => m.gender === g && m.dupr_level != null && m.dupr_level !== '').map((m) => Number(m.dupr_level));
    return xs.length ? { v: Math.round((100 * xs.reduce((s, x) => s + x, 0)) / xs.length) / 100, n: xs.length } : null;
  };
  const avgM = avg('male');
  const avgF = avg('female');
  const sport = club?.sport || 'pickleball';
  const next = upcoming[0];
  const free = (e) => (e.slots ? Math.max(0, e.slots - (e.main_count || 0)) : null);
  const birthdays = all.filter((m) => isBirthdayMonth(m.birth_date)).sort((a, b) => a.birth_date.slice(8).localeCompare(b.birth_date.slice(8)));
  const usage = me?.usage;
  const name = me?.username || me?.full_name || user?.email?.split('@')[0] || '';
  const todos = [
    // The nearest session: how full it is, and how many guests to find.
    next && next.slots
      ? {
          href: `/events/${next.id}`,
          icon: free(next) > 0 ? '🎯' : '✅',
          text: t(free(next) > 0 ? 'home.todoFill' : 'home.todoFull', { title: next.title, n: next.main_count || 0, slots: next.slots, free: free(next) }),
        }
      : null,
    requests?.length ? { href: '/club/members', icon: '📝', text: t('home.todoRequests', { n: requests.length }) } : null,
    debtors.length
      ? { href: '/club/members', icon: '💸', text: t('home.todoDebtNames', { names: debtors.slice(0, 4).map((m) => m.full_name).join(', '), more: debtors.length > 4 ? ` +${debtors.length - 4}` : '' }) }
      : null,
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

      {/* Club at a glance */}
      <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('home.rowClub')}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Kpi
          icon="👥"
          label={t('home.kpiMembers')}
          value={fixed.length}
          sub={t('home.kpiMembersSub', { guests: guests.length, n: newThisMonth })}
          href="/club/members"
          lines={[
            [`⭐ ${t('home.vip')}`, vip, 'text-amber-300'],
            [`⚡ ${t('home.priorityGuests')}`, priority, 'text-sky-300'],
          ]}
        />
        <Kpi
          icon="📅"
          label={t('home.kpiSessions')}
          value={monthEvents.length}
          sub={t('home.kpiSessionsSub', { done: doneThisMonth, left: monthEvents.length - doneThisMonth })}
          href="/events"
          lines={[
            [t('home.weeklyYear', { y: year }), `${weeklyDone}/${weeklyYear.length}`],
            [t('home.toursYear'), toursYear, toursYear ? 'text-gray-100' : 'text-amber-300'],
            [t('home.gamesYear'), gamesYear],
          ]}
        />
        <Kpi
          icon="🎚️"
          label={t('home.kpiLevels')}
          value={t('home.ratedN', { n: rated })}
          sub={t('home.rankedSub', { n: all.length })}
          href="/club/members"
          lines={[
            [t(sport === 'badminton' ? 'home.avgMaleB' : 'home.avgMale'), avgM ? t('home.avgOf', { v: levelText(avgM.v, sport, t) ?? avgM.v, n: avgM.n }) : '—'],
            [t(sport === 'badminton' ? 'home.avgFemaleB' : 'home.avgFemale'), avgF ? t('home.avgOf', { v: levelText(avgF.v, sport, t) ?? avgF.v, n: avgF.n }) : '—'],
            [t('home.unratedN'), all.length - rated, all.length - rated ? 'text-amber-300' : 'text-gray-100'],
          ]}
        />
      </div>

      {/* Money */}
      <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('home.rowMoney')}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi icon="💰" label={t('home.kpiIncome')} value={formatVnd(thisMonth.income)} tone="text-lime-400" href="/finance" />
        <Kpi icon="🧾" label={t('home.kpiExpense')} value={formatVnd(thisMonth.expense)} tone="text-red-300" href="/finance/ledger" />
        <Kpi icon="🏦" label={t('home.kpiFund')} value={formatVnd(fund?.balance || 0)} tone={Number(fund?.balance) < 0 ? 'text-red-400' : 'text-white'} href="/finance/ledger" />
        <Kpi icon="⏳" label={t('home.kpiOwed')} value={formatVnd(owed)} tone={owed ? 'text-amber-300' : 'text-white'} href="/club/members" />
      </div>

      <PendingPayments club={club} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Upcoming sessions */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Section title={t('home.upcomingEvents')} action={<Link href="/events" className="text-lime-400 text-sm">{t('nav.schedule')} →</Link>}>
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
                  const left = free(e);
                  const isToday = e.event_date === today;
                  const state = isToday
                    ? ['home.stToday', 'bg-lime-400 text-navy-950']
                    : left === 0
                      ? ['home.stFull', 'bg-red-500/20 text-red-300 border border-red-500/40']
                      : e.allow_public_registration
                        ? ['home.stOpen', 'bg-sky-400/15 text-sky-300 border border-sky-400/40']
                        : ['home.stSoon', 'bg-navy-700 text-gray-200'];
                  return (
                    <li key={e.id}>
                      <Link href={`/events/${e.id}`} className="flex items-center gap-4 py-3 group">
                        <div className={`w-14 shrink-0 rounded-xl text-center py-1.5 ${e.event_date === today ? 'bg-lime-400 text-navy-950' : 'bg-navy-900 text-white'}`}>
                          <div className="text-[10px] uppercase font-semibold opacity-80">{d.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'short' })}</div>
                          <div className="text-xl font-bold leading-6">{d.getDate()}</div>
                          <div className="text-[10px] opacity-80">{t('home.monthShort', { m: d.getMonth() + 1 })}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-white font-semibold truncate group-hover:text-lime-300">{e.title}</span>
                            <span className={`shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5 ${state[1]}`}>{t(state[0])}</span>
                          </div>
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
                            {left != null && left > 0 && <span className="text-lime-300 text-xs">{t('home.slotsLeft', { n: left })}</span>}
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
