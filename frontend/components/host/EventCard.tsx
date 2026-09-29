import { MapPin, Users } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { formatMoney, formatTime, formatDayMonth, dowShortOf } from '@/lib/utils/format';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { ProgressBar } from '../ui/progress';
import { EVENT_TONE } from '@/lib/utils/constants';

export default function EventCard({ event, onClick, showDate }: any) {
  const { t } = useI18n();
  const main = Number(event.main_count) || 0;
  const wait = Number(event.waitlist_count) || 0;
  const full = main >= event.max_slots;
  const inactive = event.status === 'cancelled';

  return (
    <Card onClick={onClick} className={inactive ? 'opacity-60' : ''}>
      <div className="flex flex-row">
        <div className="w-16 flex flex-col items-center justify-center border-r border-border mr-3 pr-3">
          {showDate && <span className="text-muted-foreground text-[11px] font-bold">{dowShortOf(event.event_date)}</span>}
          <span className="font-bold text-xl">{formatTime(event.start_time)}</span>
          {showDate ? (
            <span className="text-muted-foreground text-[11px]">{formatDayMonth(event.event_date)}</span>
          ) : event.end_time ? (
            <span className="text-muted-foreground text-[11px]">{formatTime(event.end_time)}</span>
          ) : null}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-bold text-base truncate flex-1">{event.title}</h3>
            {event.status !== 'open' && <Badge label={t(`estatus.${event.status}`)} tone={EVENT_TONE[event.status]} />}
          </div>

          {event.location && (
            <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="text-xs truncate">{event.location}</span>
            </div>
          )}

          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1">
              <ProgressBar value={main} max={event.max_slots} colorClass={full ? 'bg-amber-500' : 'bg-primary'} />
            </div>
            <span className="text-xs font-bold">{main}/{event.max_slots}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {event.club_name && <Badge label={event.club_name} tone="info" icon={Users} />}
            {full && <Badge label={t('event.full')} tone="warn" />}
            {wait > 0 && <Badge label={t('event.waitlistN', { n: wait })} tone="neutral" />}
            <span className="text-muted-foreground text-xs font-medium ml-auto">
              {Number(event.fee_amount) > 0 ? formatMoney(event.fee_amount) : t('event.free')}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}