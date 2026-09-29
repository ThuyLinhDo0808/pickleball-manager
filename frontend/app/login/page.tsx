'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/services/supabase';
import { useI18n, LANGS } from '@/lib/i18n';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();
  const { t, lang, setLanguage } = useI18n();
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      return setMessage({ type: 'error', text: t('auth.needEmailPassword') });
    }
    if (password.length < 6) {
      return setMessage({ type: 'error', text: t('auth.passwordShort') });
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { full_name: fullName.trim() || cleanEmail.split('@')[0] } },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage({ type: 'info', text: t('auth.checkEmail') });
          setIsSignUp(false);
        } else {
          router.push('/welcome');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
        router.push('/welcome');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || t('err.generic') });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-6">
      <div className="absolute top-6 right-6 flex gap-2">
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

      <div className="w-full max-w-md bg-card border border-border rounded-3xl p-8 shadow-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl mb-3">
            🏓
          </div>
          <h1 className="text-2xl font-bold">{t('app.name')}</h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">{t('app.tagline')}</p>
        </div>

        <h2 className="text-lg font-bold mb-4">{isSignUp ? t('auth.createAccount') : t('auth.signIn')}</h2>

        <form onSubmit={submit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1.5">{t('auth.fullName')}</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1.5">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="none"
              autoComplete="email"
              required
              className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1.5">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {message && (
            <p className={`text-xs text-center font-medium ${message.type === 'error' ? 'text-destructive' : 'text-emerald-600'}`}>
              {message.text}
            </p>
          )}

          <Button title={isSignUp ? t('auth.signUp') : t('auth.signIn')} loading={loading} className="w-full mt-2" />
        </form>

        <button
          type="button"
          onClick={() => { setIsSignUp(!isSignUp); setMessage(null); }}
          className="w-full text-center text-sm font-bold text-primary mt-6 hover:underline"
        >
          {isSignUp ? t('auth.haveAccount') : t('auth.noAccount')}
        </button>
      </div>
    </div>
  );
}