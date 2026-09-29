'use client';
import { Users, CalendarDays } from 'lucide-react';
import { useMode } from '@/lib/context/ModeContext';
import { useI18n } from '@/lib/i18n';

export default function WorkspaceSwitch() {
  const { mode, setMode } = useMode();
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-1 rounded-full border bg-card p-1 shadow-sm w-fit">
      <button onClick={() => setMode('club')} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${mode === 'club' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
        <Users className="h-4 w-4" /> {t('ws.club')}
      </button>
      <button onClick={() => setMode('event')} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${mode === 'event' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
        <CalendarDays className="h-4 w-4" /> {t('ws.event')}
      </button>
    </div>
  );
}