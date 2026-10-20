'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/useLoad';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { localDate } from '@/lib/dates';
import Hint from '@/components/ui/Hint';

const fmt = (d) => (d ? localDate(new Date(d), 'vi-VN', { dateStyle: 'short', timeStyle: 'short' }, true) : '—');

function errText(err, t) {
  const c = err?.payload?.code;
  if (c === 'mfa_bad_code') return t('sec.badCode');
  if (c === 'mfa_code_reused') return t('sec.codeReused');
  if (c === 'rate_limited') return t('sec.tooMany');
  if (c === 'mfa_required_for_role') return t('sec.mustKeep');
  return err?.message || String(err);
}

// The recovery codes, shown once right after they are made. To close it the person types
// one of them back — proof they were written down (a lost phone without them means asking
// the Ban quản trị for a reset).
function RecoveryCodes({ codes, onDone }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [check, setCheck] = useState('');
  const [bad, setBad] = useState(false);
  const fileText = () => `${t('sec.recoveryFileHead', { date: new Date().toLocaleString('vi-VN') })}\n\n${codes.join('\n')}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([fileText()], { type: 'text/plain;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'pickleball-manager-ma-khoi-phuc.txt' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    const w = window.open('', '_blank', 'width=480,height=640');
    if (!w) return;
    w.document.title = t('sec.recoveryTitle');
    const pre = w.document.createElement('pre');
    pre.style.cssText = 'font:16px/1.8 monospace;padding:24px';
    pre.textContent = fileText();
    w.document.body.appendChild(pre);
    w.print();
  };
  const norm = (v) => String(v).trim().toLowerCase().replace(/\s+/g, '');
  const confirm = () => {
    if (codes.some((c) => norm(c) === norm(check))) onDone();
    else setBad(true);
  };
  return (
    <div className="rounded-xl border border-amber-400/50 bg-amber-400/5 p-4">
      <p className="text-amber-200 font-semibold text-sm">🗝 {t('sec.recoveryTitle')}</p>
      <p className="text-gray-300 text-xs mt-1 mb-3">{t('sec.recoveryBody')}</p>
      <ul className="grid grid-cols-2 gap-1.5 font-mono text-sm text-white mb-3">
        {codes.map((c) => <li key={c} className="rounded bg-navy-950/70 border border-navy-700 px-2 py-1 text-center tabular-nums">{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => {
            navigator.clipboard?.writeText(codes.join('\n')).then(() => setCopied(true)).catch(() => {});
          }}
        >
          {copied ? `✓ ${t('sec.copied')}` : t('sec.copyAll')}
        </button>
        <button type="button" className="btn-secondary text-sm" onClick={download}>⬇ {t('sec.downloadCodes')}</button>
        <button type="button" className="btn-secondary text-sm" onClick={print}>🖨 {t('sec.printCodes')}</button>
      </div>
      <div className="mt-4 border-t border-amber-400/20 pt-3">
        <label htmlFor="recovery-check" className="text-xs text-gray-300">{t('sec.confirmSavedLabel')}</label>
        <div className="flex flex-wrap gap-2 mt-1">
          <input id="recovery-check" className="input !w-44 text-center font-mono tracking-wider" autoComplete="off" maxLength={11} placeholder="xxxxx-xxxxx" value={check} onChange={(e) => { setCheck(e.target.value); setBad(false); }} />
          <button type="button" className="btn-primary text-sm" disabled={check.trim().length < 10} onClick={confirm}>{t('sec.savedThem')}</button>
        </div>
        {bad && <p className="text-red-300 text-xs mt-1" role="alert">{t('sec.confirmSavedBad')}</p>}
      </div>
    </div>
  );
}

// A 6-digit code box + button, for actions that need a fresh code.
function CodeForm({ label, danger, onSubmit, onCancel }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-2 mt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await onSubmit(code.trim());
        } catch (err) {
          setError(errText(err, t));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="text-xs text-gray-400" htmlFor={`code-${label}`}>{t('sec.codeLabel')}</label>
        <input id={`code-${label}`} className="input !w-40 text-center tracking-widest tabular-nums" autoComplete="one-time-code" inputMode="text" maxLength={11} value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
      </div>
      <button type="submit" disabled={busy || code.trim().length < 6} className={danger ? 'rounded-lg px-3 py-2 text-sm font-semibold border border-red-500/60 text-red-300 hover:bg-red-500/15 disabled:opacity-40' : 'btn-primary text-sm'}>
        {busy ? t('auth.working') : label}
      </button>
      {onCancel && <button type="button" className="btn-secondary text-sm" onClick={onCancel}>{t('common.cancel')}</button>}
      {error && <p className="w-full text-red-300 text-sm" role="alert">{error}</p>}
    </form>
  );
}

export default function AccountSecurity() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/host/security'), []);
  const [setup, setSetup] = useState(null); // { secret, otpauth, qr }
  const [codes, setCodes] = useState(null);
  const [mode, setMode] = useState(null); // 'disable' | 'recovery'
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (setup && !setup.qr) QRCode.toDataURL(setup.otpauth, { margin: 1, width: 200 }).then((qr) => setSetup((s) => ({ ...s, qr }))).catch(() => {});
  }, [setup]);

  if (loading) return <p className="text-gray-400 text-sm">{t('common.loading')}</p>;
  if (error) return <p className="text-red-300 text-sm">{error.payload?.code === 'migration_required' ? t('sec.needMigration') : error.message}</p>;
  // Just turned on (recovery codes showing): already on, before the page reloads.
  const mfa = codes && !data.mfa.enabled ? { ...data.mfa, enabled: true, enabled_at: new Date().toISOString(), recovery_left: codes.length } : data.mfa;

  async function begin() {
    setMsg('');
    setCodes(null);
    setSetup(await api.post('/api/host/security/mfa/setup', {}));
  }

  async function logoutAll() {
    if (!window.confirm(t('sec.logoutAllAsk'))) return;
    await api.post('/api/host/security/logout-all', {});
    await signOut().catch(() => {});
    window.location.href = '/sign-in';
  }

  return (
    <div className="space-y-5">
      {/* Two-step sign-in */}
      <div className="rounded-xl border border-navy-700 bg-navy-900/40 p-4">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <p className="text-white font-semibold">🔐 {t('sec.mfaTitle')} <Hint inline text={t('sec.mfaHint')} /></p>
          </div>
          <span className={`text-xs font-semibold rounded-full border px-2.5 py-0.5 ${mfa.enabled ? 'border-lime-400/60 text-lime-300' : 'border-gray-500 text-gray-300'}`}>
            {mfa.enabled ? `✓ ${t('sec.on')}` : t('sec.off')}
          </span>
        </div>
        {data.required && !mfa.enabled && <p className="mt-3 text-amber-200 text-sm">⚠️ {t('sec.requiredForRole')}</p>}
        {mfa.enabled && mfa.reset && !codes && (
          <div className="mt-3 rounded-lg border border-red-400/50 bg-red-500/10 p-3 text-sm" role="alert">
            <p className="text-red-200 font-semibold">⚠️ {t('sec.resetPending', { at: fmt(mfa.reset.at) })}</p>
            <p className="text-gray-300 text-xs mt-1">{t('sec.resetPendingHint')}</p>
            <button
              type="button"
              className="btn-primary text-sm mt-2"
              onClick={async () => {
                try {
                  await api.post('/api/host/security/mfa/reset-cancel', {});
                  reload();
                } catch (e) {
                  setMsg(errText(e, t));
                }
              }}
            >
              {t('sec.resetCancelBtn')}
            </button>
          </div>
        )}

        {codes && <div className="mt-4"><RecoveryCodes codes={codes} onDone={() => { setCodes(null); reload(); }} /></div>}

        {!mfa.enabled && !setup && (
          <button type="button" className="btn-primary text-sm mt-4" onClick={() => begin().catch((e) => setMsg(errText(e, t)))}>{t('sec.enable')}</button>
        )}

        {!mfa.enabled && setup && (
          <div className="mt-4 grid sm:grid-cols-[auto,1fr] gap-4 items-start">
            <div className="rounded-lg bg-white p-2 w-[216px] h-[216px] flex items-center justify-center">
              {setup.qr ? <img src={setup.qr} alt={t('sec.qrAlt')} width={200} height={200} /> : <span className="text-navy-900 text-xs">…</span>}
            </div>
            <div className="min-w-0 text-sm">
              <ol className="list-decimal pl-5 space-y-1 text-gray-300">
                <li>{t('sec.step1')}</li>
                <li>{t('sec.step2')}</li>
                <li>{t('sec.step3')}</li>
              </ol>
              <p className="text-sky-200 text-xs mt-3 rounded-lg border border-sky-400/30 bg-sky-400/5 px-2.5 py-2">💡 {t('sec.backupTip')}</p>
              <p className="text-gray-400 text-xs mt-3">{t('sec.manualKey')}</p>
              <code className="block break-all rounded bg-navy-950/70 border border-navy-700 px-2 py-1 mt-1 text-lime-200 text-xs select-all">{setup.secret}</code>
              <CodeForm
                label={t('sec.confirmOn')}
                onCancel={() => setSetup(null)}
                onSubmit={async (code) => {
                  const r = await api.post('/api/host/security/mfa/enable', { code });
                  setSetup(null);
                  setCodes(r.recovery_codes);
                }}
              />
            </div>
          </div>
        )}

        {mfa.enabled && !codes && (
          <div className="mt-3 text-sm">
            <p className="text-gray-300">
              {t('sec.onSince', { date: fmt(mfa.enabled_at) })} · {t('sec.recoveryLeft', { n: mfa.recovery_left })}
            </p>
            {mfa.recovery_left <= 2 && <p className="text-amber-200 text-xs mt-1">⚠️ {t('sec.recoveryLow')}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" className="btn-secondary text-sm" onClick={() => setMode(mode === 'recovery' ? null : 'recovery')}>🗝 {t('sec.newRecovery')}</button>
              {!data.required && (
                <button type="button" className="rounded-lg px-3 py-2 text-sm border border-red-500/50 text-red-300 hover:bg-red-500/10" onClick={() => setMode(mode === 'disable' ? null : 'disable')}>
                  {t('sec.disable')}
                </button>
              )}
            </div>
            {mode === 'recovery' && (
              <CodeForm
                label={t('sec.makeCodes')}
                onCancel={() => setMode(null)}
                onSubmit={async (code) => {
                  const r = await api.post('/api/host/security/mfa/recovery', { code });
                  setMode(null);
                  setCodes(r.recovery_codes);
                }}
              />
            )}
            {mode === 'disable' && (
              <CodeForm
                danger
                label={t('sec.confirmOff')}
                onCancel={() => setMode(null)}
                onSubmit={async (code) => {
                  await api.post('/api/host/security/mfa/disable', { code });
                  setMode(null);
                  reload();
                }}
              />
            )}
          </div>
        )}
        {msg && <p className="text-red-300 text-sm mt-2">{msg}</p>}
      </div>

      {/* Devices */}
      <div className="rounded-xl border border-navy-700 bg-navy-900/40 p-4">
        <p className="text-white font-semibold">💻 {t('sec.devicesTitle')} <Hint inline text={t('sec.devicesHint')} /></p>
        {data.devices.length === 0 ? (
          <p className="text-gray-500 text-sm">{t('sec.noDevices')}</p>
        ) : (
          <ul className="divide-y divide-navy-700">
            {data.devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="text-white font-medium">{d.label}</span>
                <span className="text-gray-500 text-xs">{d.ip_hint || '—'}</span>
                <span className="text-gray-400 text-xs">{t('sec.lastSeen', { date: fmt(d.last_seen) })}</span>
                <button
                  type="button"
                  className="ml-auto text-xs text-gray-400 hover:text-red-300 underline underline-offset-2"
                  onClick={async () => {
                    await api.del(`/api/host/security/devices/${d.id}`);
                    reload();
                  }}
                >
                  {t('sec.forget')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-red-200 text-sm font-semibold">{t('sec.logoutAll')} <Hint inline text={t('sec.logoutAllHint')} /></p>
          <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold border border-red-500/60 text-red-300 hover:bg-red-500/15" onClick={() => logoutAll().catch((e) => setMsg(errText(e, t)))}>
            🚪 {t('sec.logoutAll')}
          </button>
        </div>
      </div>
    </div>
  );
}
