'use client';
import { useRouter } from 'next/navigation';
import { LogOut, Users, CalendarDays } from 'lucide-react';
import { supabase } from '@/lib/services/supabase';
import { api } from '@/lib/services/api';
import { useLoad } from '@/lib/hooks/useLoad';
import { useMode } from '@/lib/context/ModeContext';
import { useI18n, LANGS } from '@/lib/i18n';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import CapacityBanner from '@/components/host/CapacityBanner';

const APP_VERSION = '1.1.0';

export default function AccountPage() {
  const router = useRouter();
  const { t, lang, setLanguage } = useI18n();
  const { mode, setMode } = useMode();
  const { data } = useLoad(() => api.get('/host/me'), []);
  const user = data?.user;

  function confirmSignOut() {
    if (window.confirm(t('account.signOutConfirm'))) {
      supabase.auth.signOut().then(() => router.push('/login'));
    }
  }

  const other = mode === 'club' ? 'event' : 'club';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
          {user?.full_name?.[0]?.toUpperCase() || 'H'}
        </div>
        <div>
          <h2 className="text-lg font-bold">{user?.full_name || '—'}</h2>
          <p className="text-muted-foreground">{user?.email}</p>
        </div>
      </Card>

      <CapacityBanner />

      <section>
        <h3 className="text-sm font-bold mb-3">{t('account.language')}</h3>
        <Segmented
          value={lang}
          onChange={setLanguage}
          options={LANGS.map((l: any) => ({ value: l.code, label: l.label }))}
        />
      </section>

      <section>
        <h3 className="text-sm font-bold mb-3">{t('account.workspace')}</h3>
        <Card className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            {mode === 'club' ? <Users className="text-primary w-5 h-5" /> : <CalendarDays className="text-primary w-5 h-5" />}
            <span className="font-bold">{mode === 'club' ? t('ws.clubFull') : t('ws.eventFull')}</span>
          </div>
          <Button 
            variant="secondary" 
            title={t('account.switchTo', { name: other === 'club' ? t('ws.club') : t('ws.event') })} 
            onClick={() => setMode(other)} 
          />
        </Card>
      </section>

      <Button title={t('account.signOut')} variant="ghost" icon={LogOut} onClick={confirmSignOut} className="w-full mt-8" />
      <p className="text-center text-xs text-muted-foreground mt-4">Pickleball Host · v{APP_VERSION}</p>
    </div>
  );
}