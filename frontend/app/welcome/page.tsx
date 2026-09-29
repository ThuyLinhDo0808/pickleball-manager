'use client';
import { useRouter } from 'next/navigation';
import { Users, CalendarDays, ChevronRight } from 'lucide-react';
import { useMode } from '@/lib/context/ModeContext';
import { useI18n, LANGS } from '@/lib/i18n';
import { supabase } from '@/lib/services/supabase';

export default function WelcomePage() {
  const router = useRouter();
  const { setMode } = useMode();
  const { t, lang, setLanguage } = useI18n();

  function handleSelectMode(nextMode: 'club' | 'event') {
    setMode(nextMode);
    router.push(nextMode === 'club' ? '/dashboard' : '/events');
  }

  const options = [
    { mode: 'club' as const, icon: Users, color: 'bg-blue-600 hover:bg-blue-700', title: t('welcome.clubTitle'), desc: t('welcome.clubDesc') },
    { mode: 'event' as const, icon: CalendarDays, color: 'bg-emerald-600 hover:bg-emerald-700', title: t('welcome.eventTitle'), desc: t('welcome.eventDesc') },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between p-6 max-w-xl mx-auto">
      <div className="flex justify-end gap-2 pt-4">
        {LANGS.map((l: any) => (
          <button
            key={l.code}
            onClick={() => setLanguage(l.code)}
            className={`px-3 py-1 rounded-full text-xs font-bold border ${lang === l.code ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'}`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="py-8">
        <h1 className="text-3xl font-bold text-center">{t('welcome.title')}</h1>
        <p className="text-sm text-muted-foreground text-center mt-2 mb-8">{t('welcome.subtitle')}</p>

        <div className="space-y-4">
          {options.map((o) => {
            const Icon = o.icon;
            return (
              <button
                key={o.mode}
                onClick={() => handleSelectMode(o.mode)}
                className={`w-full ${o.color} text-white rounded-2xl p-6 text-left transition-all flex items-center gap-4 shadow-sm`}
              >
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold mb-1">{o.title}</h3>
                  <p className="text-xs text-slate-100">{o.desc}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-white/70 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-center pb-6">
        <button
          onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
          className="text-xs font-bold text-primary hover:underline"
        >
          {t('account.signOut')}
        </button>
      </div>
    </div>
  );
}