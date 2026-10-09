'use client';
import HomeLink from '@/components/HomeLink';
import { useParams } from 'next/navigation';
import TicketCard from '@/components/TicketCard';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';

// A player's ticket (check-in QR) for one registration. Opened from the sign-up page,
// the Telegram message, or a friend's link after a slot transfer. No login needed.
export default function TicketPage() {
  const { code } = useParams();
  const { t, lang, setLang } = useI18n();
  const { data: tk, error, loading } = useLoad(() => api.publicGet(`/api/public/tickets/${code}`), [code]);

  const langToggle = (
    <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="text-xs text-gray-400 border border-navy-700 rounded-full px-3 py-1">
      {lang === 'vi' ? 'EN' : 'VI'}
    </button>
  );

  if (loading && !tk) return <div className="min-h-screen flex items-center justify-center text-gray-400">{t('common.loading')}</div>;
  if (error || !tk) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-gray-300">{!error || error.status === 404 ? t('ticket.notFound') : t('public.loadError')}</p>
        {error && error.status !== 404 && <p className="text-gray-500 text-xs break-all">{error.message}</p>}
        {langToggle}
      </div>
    );
  }

  const e = tk.event;
  const time = [hhmm(e.start_time), hhmm(e.end_time)].filter(Boolean).join(' – ');
  return (
    <div className="min-h-screen max-w-md mx-auto px-4 pt-safe pb-safe-4">
      <header className="flex items-center justify-between py-4">
        <span className="text-lime-400 font-bold truncate">{e.club_name || t('appName')}</span>
        <div className="flex items-center gap-2">
          <HomeLink />
          {langToggle}
        </div>
      </header>
      <section className="card mb-4">
        <p className="text-gray-400 text-xs uppercase tracking-wide">{t('ticket.title')}</p>
        <h1 className="text-white text-xl font-bold">{e.title}</h1>
        <p className="text-lime-400 text-sm capitalize">
          {formatDay(e.event_date, lang, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          {time && ` · ${time}`}
        </p>
        {e.location && <p className="text-gray-300 text-sm mt-1">📍 {e.location}</p>}
      </section>
      <section className="card mb-4">
        {tk.valid ? (
          <TicketCard
            ticketCode={tk.checkin_code.replace(/^PBT:/, '')}
            name={tk.full_name}
            subtitle={tk.status === 'checked_in' ? `✓ ${t('signup.checkedIn')}` : tk.transferred_from ? t('ticket.transferredFrom', { name: tk.transferred_from }) : null}
          />
        ) : (
          <div className="text-center py-4">
            <div className="text-3xl">{tk.status === 'pending' ? '⏳' : '🚫'}</div>
            <p className="text-white font-semibold mt-1">{tk.full_name}</p>
            <p className="text-gray-300 text-sm mt-1">
              {tk.status === 'pending' ? t('signup.hostChecking') : tk.status === 'waitlisted' ? t('public.successWait') : t('ticket.invalid')}
            </p>
          </div>
        )}
      </section>
      {e.public_token && (
        <a href={`/e/${e.public_token}`} className="block text-center text-gray-400 text-sm underline mb-6">{t('ticket.eventPage')}</a>
      )}
      <p className="text-center text-gray-600 text-xs pb-4">{t('public.poweredBy')}</p>
    </div>
  );
}
