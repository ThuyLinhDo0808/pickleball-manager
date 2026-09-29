'use client';
import { use, useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { api } from '@/lib/services/api';
import { useLoad } from '@/lib/hooks/useLoad';
import { useI18n } from '@/lib/i18n';
import { formatDate, formatTimeRange, parseMoney } from '@/lib/utils/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EVENT_TONE, PARTICIPANT_TONE } from '@/lib/constants';
import { toast } from 'sonner';

export default function ParticipantsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { t } = useI18n();
  const { data, error, loading, reload } = useLoad(async () => {
    const [e, p] = await Promise.all([
      api.get(`/api/events/${eventId}`),
      api.get(`/api/events/${eventId}/participants`),
    ]);
    return { event: e.event, participants: p.participants };
  }, [eventId]);

  const [showAdd, setShowAdd] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const all = data?.participants || [];
    return {
      main: all.filter((p: any) => ['registered', 'checked_in', 'no_show'].includes(p.status)),
      waitlist: all.filter((p: any) => p.status === 'waitlist'),
      cancelled: all.filter((p: any) => p.status === 'cancelled'),
    };
  }, [data]);

  if (loading) return <div className="p-8 text-center">Đang tải...</div>;
  if (error && !data) return <div className="p-8 text-center text-destructive">Lỗi tải dữ liệu</div>;

  const { event } = data;
  const checkedIn = groups.main.filter((p: any) => p.status === 'checked_in').length;
  const noShows = groups.main.filter((p: any) => p.status === 'no_show').length;

  async function act(p: any, action: string) {
    try {
      setBusyId(p.id);
      const res: any = await api.post(`/api/events/${eventId}/participants/${p.id}/${action}`, {});
      if (action === 'cancel' && res?.promoted) {
        toast.success(t('participants.promoted', { name: res.promoted.display_name }));
      }
      reload();
    } catch (e: any) {
      toast.error(t('participants.updateFailed') + ': ' + e.message);
    } finally {
      setBusyId(null);
    }
  }

  const row = (p: any) => {
    const busy = busyId === p.id;
    return (
      <Card key={p.id} className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0 text-sm">
            {p.display_name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-base truncate">{p.display_name}</h4>
              {p.source_club_member_id && <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
            </div>
            {p.phone && <p className="text-xs text-muted-foreground mt-0.5">{p.phone}</p>}
          </div>
          <Badge label={t(`status.${p.status}`)} tone={PARTICIPANT_TONE[p.status]} />
        </div>

        {p.status !== 'cancelled' && (
          <div className="flex gap-2 flex-wrap pt-1 border-t border-border/50">
            {p.status === 'waitlist' ? (
              <Button size="sm" title={t('participants.promote')} disabled={busy} onClick={() => act(p, 'promote')} />
            ) : (
              <>
                {p.status !== 'checked_in' && <Button size="sm" title={t('participants.checkIn')} disabled={busy} onClick={() => act(p, 'check-in')} />}
                {p.status !== 'no_show' && <Button size="sm" variant="secondary" title={t('participants.noShow')} disabled={busy} onClick={() => act(p, 'no-show')} />}
              </>
            )}
            <Button size="sm" variant="ghost" title={t('common.cancel')} disabled={busy} onClick={() => { if (window.confirm(t('participants.cancelBody', { name: p.display_name }))) act(p, 'cancel'); }} />
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <Card className="bg-card">
        <div className="flex justify-between items-start gap-4">
          <h2 className="text-xl font-bold flex-1">{event.title}</h2>
          <Badge label={t(`estatus.${event.status}`)} tone={EVENT_TONE[event.status]} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {formatDate(event.event_date)} · {formatTimeRange(event.start_time, event.end_time)} {event.location ? `· ${event.location}` : ''}
        </p>
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
          <span className="font-bold text-foreground">{groups.main.length}</span>{t('participants.ofSlots', { max: event.max_slots })}
          {' · '} {t('participants.waitlistN', { n: groups.waitlist.length })}
          {' · '} {t('participants.checkedInN', { n: checkedIn })}
          {' · '} {t('participants.noShowN', { n: noShows })}
        </p>
      </Card>

      <div className="space-y-3">
        <h3 className="font-bold text-base">{t('participants.mainList', { n: groups.main.length })}</h3>
        {groups.main.length === 0 ? <Card className="text-center py-6 text-muted-foreground">{t('participants.emptyMain')}</Card> : groups.main.map(row)}
      </div>

      {groups.waitlist.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-base">{t('participants.waitlistTitle', { n: groups.waitlist.length })}</h3>
          {groups.waitlist.map(row)}
        </div>
      )}

      <div className="fixed bottom-6 right-6 z-40">
        <Button title={t('participants.add')} icon={Plus} onClick={() => setShowAdd('manual')} className="shadow-lg" />
      </div>

      {showAdd === 'manual' && (
        <ManualAddModal eventId={eventId} event={event} onClose={() => setShowAdd(null)} onDone={reload} />
      )}
    </div>
  );
}

function ManualAddModal({ eventId, event, onClose, onDone }: any) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [fee, setFee] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return alert(t('participants.nameRequiredBody'));
    try {
      setSaving(true);
      const res: any = await api.post(`/api/events/${eventId}/participants`, {
        display_name: name.trim(), phone: phone.trim() || null,
        fee_amount: fee.trim() ? parseMoney(fee) : null,
      });
      toast.success(res.waitlisted ? t('participants.addedWaitlist', { name: res.participant.display_name }) : t('participants.added', { name: res.participant.display_name }));
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(t('participants.addFailed') + ': ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md bg-background">
        <h2 className="text-lg font-bold mb-4">{t('participants.addTitle')}</h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">{t('participants.name')}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">{t('participants.phone')}</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">{t('participants.customFee', { def: Number(event.fee_amount) || 0 })}</label>
            <input type="text" value={fee} onChange={(e) => setFee(e.target.value)} className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" title={t('common.cancel')} onClick={onClose} />
            <Button type="submit" title={t('participants.add')} loading={saving} />
          </div>
        </form>
      </Card>
    </div>
  );
}