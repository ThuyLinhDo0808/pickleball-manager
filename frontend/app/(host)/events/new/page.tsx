'use client';
import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { api } from '@/lib/services/api';
import { useLoad } from '@/lib/hooks/useLoad';
import { useI18n } from '@/lib/i18n';
import { todayISO, parseMoney } from '@/lib/utils/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { toast } from 'sonner';

export default function EventFormPage({ params }: { params?: Promise<{ eventId?: string }> }) {
  const resolvedParams = params ? use(params) : {};
  const eventId = resolvedParams.eventId;
  const editing = !!eventId;

  const router = useRouter();
  const searchParams = useSearchParams();
  const presetDate = searchParams.get('date');
  const presetClub = searchParams.get('clubId');
  const { t } = useI18n();

  const { data, error, loading } = useLoad(async () => {
    const [c, e] = await Promise.all([
      api.get('/api/clubs'),
      editing ? api.get(`/api/events/${eventId}`) : Promise.resolve(null),
    ]);
    return { clubs: c.clubs, event: e ? e.event : null };
  }, [eventId]);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(presetDate || todayISO());
  const [start, setStart] = useState('19:00');
  const [end, setEnd] = useState('21:00');
  const [location, setLocation] = useState('');
  const [courts, setCourts] = useState('2');
  const [slots, setSlots] = useState('12');
  const [level, setLevel] = useState('');
  const [fee, setFee] = useState('');
  const [courtCost, setCourtCost] = useState('');
  const [ballCost, setBallCost] = useState('');
  const [clubId, setClubId] = useState<string | null>(presetClub || null);
  const [repeat, setRepeat] = useState('none');
  const [repeatCount, setRepeatCount] = useState('4');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ev = data?.event;
    if (!ev) return;
    setTitle(ev.title);
    setDate(ev.event_date);
    setStart(String(ev.start_time).slice(0, 5));
    setEnd(ev.end_time ? String(ev.end_time).slice(0, 5) : '');
    setLocation(ev.location || '');
    setCourts(String(ev.num_courts));
    setSlots(String(ev.max_slots));
    setLevel(ev.required_level != null ? String(Number(ev.required_level)) : '');
    setFee(String(Number(ev.fee_amount) || ''));
    setCourtCost(String(Number(ev.court_cost) || ''));
    setBallCost(String(Number(ev.ball_cost) || ''));
    setClubId(ev.club_id || null);
  }, [data]);

  if (loading) return <div className="p-8 text-center">Đang tải...</div>;
  if (error && !data) return <div className="p-8 text-center text-destructive">Lỗi tải dữ liệu</div>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return alert(t('eventForm.titleRequired'));

    const payload = {
      title: title.trim(), event_date: date, start_time: start, end_time: end || null,
      location: location.trim() || null, num_courts: Number(courts), max_slots: Number(slots),
      required_level: level.trim() ? Number(level.replace(',', '.')) : null,
      fee_amount: parseMoney(fee), court_cost: parseMoney(courtCost), ball_cost: parseMoney(ballCost),
      club_id: clubId,
    };

    try {
      setSaving(true);
      if (editing) {
        await api.patch(`/api/events/${eventId}`, payload);
        toast.success(t('common.saved'));
        router.push(`/events/${eventId}/participants`);
      } else {
        const series = repeat === 'weekly' ? Number(repeatCount) : 1;
        const res = await api.post('/api/events', { ...payload, repeat_count: series });
        if (series > 1) {
          toast.success(t('eventForm.seriesCreated', { count: series }));
          router.push('/events');
        } else {
          toast.success(t('eventForm.created'));
          router.push(`/events/${res.event.id}/participants`);
        }
      }
    } catch (err: any) {
      toast.error(t('eventForm.saveFailed') + ': ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const clubs = data?.clubs || [];

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <Card>
        <h2 className="text-xl font-bold mb-6">{editing ? t('eventForm.editTitle') : t('eventForm.newTitle')}</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.title')}</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('eventForm.titlePlaceholder')} required autoFocus className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          {clubs.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.club')}</label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button type="button" onClick={() => setClubId(null)} className={`px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap ${!clubId ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'}`}>
                  {t('eventForm.noClub')}
                </button>
                {clubs.map((c: any) => (
                  <button type="button" key={c.id} onClick={() => setClubId(c.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap ${clubId === c.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'}`}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.date')}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.start')}</label>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.end')}</label>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.location')}</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('eventForm.locationPlaceholder')} className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.courts')}</label>
              <input type="number" value={courts} onChange={(e) => setCourts(e.target.value)} min="1" required className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.slots')}</label>
              <input type="number" value={slots} onChange={(e) => setSlots(e.target.value)} min="1" required className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.level')}</label>
              <input type="text" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="3.0" className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.fee')}</label>
            <input type="text" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="80.000" className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          <div className="pt-2">
            <h3 className="font-bold text-sm mb-1">{t('eventForm.costs')}</h3>
            <p className="text-xs text-muted-foreground mb-3">{t('eventForm.costsHint')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.courtCost')}</label>
                <input type="text" value={courtCost} onChange={(e) => setCourtCost(e.target.value)} className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.ballCost')}</label>
                <input type="text" value={ballCost} onChange={(e) => setBallCost(e.target.value)} className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
          </div>

          {!editing && (
            <div className="pt-2">
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.repeat')}</label>
              <Segmented value={repeat} onChange={setRepeat} options={[{ value: 'none', label: t('eventForm.repeatNone') }, { value: 'weekly', label: t('eventForm.repeatWeekly') }]} />
              {repeat === 'weekly' && (
                <div className="mt-3">
                  <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.repeatCount')}</label>
                  <input type="number" value={repeatCount} onChange={(e) => setRepeatCount(e.target.value)} min="2" max="12" className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <p className="text-[11px] text-muted-foreground mt-1">{t('eventForm.repeatHint')}</p>
                </div>
              )}
            </div>
          )}

          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" title={t('common.cancel')} onClick={() => router.back()} />
            <Button type="submit" title={editing ? t('common.save') : t('eventForm.create')} loading={saving} />
          </div>
        </form>
      </Card>
    </div>
  );
}