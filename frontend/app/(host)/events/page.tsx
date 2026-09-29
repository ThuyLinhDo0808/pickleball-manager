'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Users } from 'lucide-react';
import { api } from '@/lib/services/api';
import { useLoad } from '@/lib/hooks/useLoad';
import { useI18n } from '@/lib/i18n';
import { todayISO, relativeDay, monthTitle, weekdayShort, pad2 } from '@/lib/utils/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import EventCard from '@/components/host/EventCard';

function buildMonth(year: number, month: number) {
  const firstDow = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(`${year}-${pad2(month + 1)}-${pad2(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export default function SchedulePage() {
  const router = useRouter();
  const { t } = useI18n();
  const { data, error, loading } = useLoad(() => api.get('/api/events'), []);

  const today = todayISO();
  const [view, setView] = useState('calendar');
  const [selected, setSelected] = useState(today);
  const [cursor, setCursor] = useState(() => { const [y, m] = today.split('-').map(Number); return { y, m: m - 1 }; });
  const [scope, setScope] = useState('upcoming');
  const [clubFilter, setClubFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const events = data?.events || [];

  const byDate = useMemo(() => {
    const map: any = {};
    events.forEach((e: any) => { (map[e.event_date] = map[e.event_date] || []).push(e); });
    Object.values(map).forEach((list: any) => list.sort((a: any, b: any) => String(a.start_time).localeCompare(String(b.start_time))));
    return map;
  }, [events]);

  const clubs = useMemo(() => {
    const seen = new Map();
    events.forEach((e: any) => { if (e.club_id && !seen.has(e.club_id)) seen.set(e.club_id, e.club_name); });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [events]);

  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = events.filter((e: any) => (scope === 'upcoming' ? e.event_date >= today : e.event_date < today));
    if (clubFilter) list = list.filter((e: any) => e.club_id === clubFilter);
    if (q) list = list.filter((e: any) => e.title.toLowerCase().includes(q) || (e.location || '').toLowerCase().includes(q));
    return list.sort((a: any, b: any) => {
      const ka = a.event_date + String(a.start_time);
      const kb = b.event_date + String(b.start_time);
      return scope === 'upcoming' ? ka.localeCompare(kb) : kb.localeCompare(ka);
    });
  }, [events, scope, clubFilter, query, today]);

  if (loading) return <div className="p-8 text-center">Đang tải...</div>;
  if (error && !data) return <div className="p-8 text-center text-destructive">Lỗi tải dữ liệu</div>;

  const dayEvents = byDate[selected] || [];

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(cursor.y, cursor.m + delta, 1));
    const next = { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    setCursor(next);
    const first = `${next.y}-${pad2(next.m + 1)}-01`;
    setSelected(today.startsWith(`${next.y}-${pad2(next.m + 1)}`) ? today : first);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Segmented
          value={view}
          onChange={setView}
          options={[{ value: 'calendar', label: t('schedule.calendar') }, { value: 'list', label: t('schedule.list') }]}
          style={{ width: '200px' }}
        />
        <div className="flex gap-2">
          <Link href="/events/reliability">
            <Button variant="secondary" title={t('players.title')} icon={Users} />
          </Link>
          <Link href="/events/new">
            <Button title={t('schedule.newEvent')} icon={Plus} />
          </Link>
        </div>
      </div>

      {view === 'calendar' ? (
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => shiftMonth(-1)} className="p-2 hover:bg-muted rounded-full"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={() => { const [y, m] = today.split('-').map(Number); setCursor({ y, m: m - 1 }); setSelected(today); }}>
                <h3 className="font-bold text-lg">{monthTitle(cursor.y, cursor.m)}</h3>
              </button>
              <button onClick={() => shiftMonth(1)} className="p-2 hover:bg-muted rounded-full"><ChevronRight className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2 text-center">
              {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                <span key={dow} className="text-xs font-bold text-muted-foreground">{weekdayShort(dow)}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {buildMonth(cursor.y, cursor.m).map((iso, i) => {
                if (!iso) return <div key={`pad${i}`} className="h-16" />;
                const isSel = iso === selected;
                const isToday = iso === today;
                const list = byDate[iso] || [];
                return (
                  <button
                    key={iso}
                    onClick={() => setSelected(iso)}
                    className={`h-16 flex flex-col items-center justify-center rounded-xl transition-colors border ${isSel ? 'bg-primary text-primary-foreground border-primary' : isToday ? 'border-primary' : 'border-transparent hover:bg-muted'}`}
                  >
                    <span className={`font-bold text-sm ${isSel ? 'text-primary-foreground' : ''}`}>{Number(iso.slice(8))}</span>
                    <div className="flex gap-1 h-2 mt-1">
                      {list.slice(0, 3).map((e: any) => (
                        <div key={e.id} className={`w-1.5 h-1.5 rounded-full ${e.status === 'cancelled' ? 'bg-muted-foreground' : 'bg-blue-400'}`} />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base">{relativeDay(selected)}</h3>
              <span className="text-xs text-muted-foreground">{t('schedule.eventCount', { count: dayEvents.length })}</span>
            </div>
            {dayEvents.length === 0 ? (
              <Card className="text-center py-8">
                <p className="text-sm text-muted-foreground mb-4">{t('schedule.emptyDay')}</p>
                <Link href={`/events/new?date=${selected}`}>
                  <Button variant="secondary" title={t('schedule.createOnDay')} icon={Plus} />
                </Link>
              </Card>
            ) : (
              dayEvents.map((e: any) => (
                <EventCard key={e.id} event={e} onClick={() => router.push(`/events/${e.id}/participants`)} />
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Segmented
            value={scope}
            onChange={setScope}
            options={[{ value: 'upcoming', label: t('schedule.upcoming') }, { value: 'past', label: t('schedule.past') }]}
          />
          {clubs.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setClubFilter(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap ${!clubFilter ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'}`}
              >
                {t('schedule.allClubs')}
              </button>
              {clubs.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setClubFilter(clubFilter === c.id ? null : c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap flex items-center gap-1.5 ${clubFilter === c.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'}`}
                >
                  <Users className="w-3 h-3" /> {c.name}
                </button>
              ))}
            </div>
          )}

          {filteredList.length === 0 ? (
            <Card className="text-center py-12 text-muted-foreground">{t('schedule.emptyUpcoming')}</Card>
          ) : (
            <div className="space-y-3">
              {filteredList.map((e: any) => (
                <EventCard key={e.id} event={e} showDate onClick={() => router.push(`/events/${e.id}/participants`)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}