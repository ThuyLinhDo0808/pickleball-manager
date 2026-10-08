'use client';
import { useState } from 'react';
import OwnerShell, { fmtTime } from '@/components/OwnerShell';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const Light = ({ ok }) => <span className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-lime-400' : 'bg-gray-500'}`} aria-hidden="true" />;

// Is everything set up? Integrations (configured or not — never the key values),
// database migrations, and the switches the owner can flip without a redeploy.
export default function OwnerSystemPage() {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get('/api/owner/system'), []);
  const [confirm, setConfirm] = useState(null); // { key, value }
  const [mail, setMail] = useState(null);
  const [busy, setBusy] = useState(false);
  const testEmail = async () => {
    setBusy(true);
    setMail(null);
    try {
      const r = await api.post('/api/owner/system/test-email', {});
      setMail({ ok: true, text: t('owner.testEmailSent', { to: r.to }) });
    } catch (e) {
      setMail({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    setBusy(true);
    try {
      await api.patch(`/api/owner/settings/${confirm.key}`, { value: confirm.value });
      setConfirm(null);
      reload();
    } catch (e) {
      setConfirm({ ...confirm, error: e.message });
    } finally {
      setBusy(false);
    }
  };
  const self = data?.settings?.tier_self_serve;
  return (
    <OwnerShell title={t('owner.tabSystem')}>
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {data && (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <section className="card !p-4">
            <h2 className="text-white font-semibold mb-1">🔌 {t('owner.sysIntegrations')}</h2>
            <p className="text-gray-500 text-xs mb-3">{t('owner.sysNoKeys')}</p>
            <ul className="divide-y divide-navy-700">
              {data.integrations.map((i) => (
                <li key={i.key} className="py-2 flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-200 flex items-center gap-2"><Light ok={i.ok} /> {t(`owner.int_${i.key}`)}</span>
                  <span className={i.ok ? 'text-lime-300 text-xs' : 'text-gray-500 text-xs'}>{i.ok ? t('owner.configured') : t('owner.notConfigured')}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={testEmail}>✉️ {t('owner.testEmail')}</button>
              {mail && <span className={`text-xs ${mail.ok ? 'text-lime-300' : 'text-red-300'}`}>{mail.text}</span>}
            </div>
          </section>

          <section className="card !p-4">
            <h2 className="text-white font-semibold mb-1">⚙️ {t('owner.sysSettings')}</h2>
            {self && (
              <div className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-gray-200 text-sm">{t('owner.set_tier_self_serve')}</div>
                  <div className="text-gray-500 text-xs">{t('owner.set_tier_self_serve_hint')}</div>
                  <div className="text-gray-500 text-[11px] mt-0.5">
                    {t(`owner.src_${self.source}`)}{self.updated_by ? ` · ${self.updated_by} · ${fmtTime(self.updated_at)}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={self.value === true}
                  aria-label={t('owner.set_tier_self_serve')}
                  onClick={() => setConfirm({ key: 'tier_self_serve', value: self.value !== true })}
                  className={`shrink-0 w-11 h-6 rounded-full relative transition ${self.value ? 'bg-amber-300' : 'bg-navy-600'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${self.value ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            )}

            <h2 className="text-white font-semibold mt-4 mb-1">🗄 {t('owner.sysMigrations')}</h2>
            <p className={`text-sm mb-2 ${data.migrations.ok ? 'text-lime-300' : 'text-amber-200'}`}>
              {data.migrations.ok ? `✓ ${t('owner.migOk')}` : `⚠️ ${t('owner.migMissing', { n: data.migrations.missing.length })}`}
            </p>
            <ul className="text-xs font-mono max-h-64 overflow-y-auto">
              {data.migrations.all.map((m) => (
                <li key={m} className={`py-0.5 ${data.migrations.missing.includes(m) ? 'text-amber-200' : 'text-gray-400'}`}>{data.migrations.missing.includes(m) ? '✗' : '✓'} {m}</li>
              ))}
            </ul>
            <p className="text-gray-500 text-xs mt-2">{t('owner.ownersCount', { n: data.owners })}</p>
          </section>
        </div>
      )}
      <Modal open={!!confirm} title={t('owner.confirmSetting')} onClose={() => setConfirm(null)}>
        {confirm && (
          <>
            <p className="text-gray-200 text-sm mb-2">{t(confirm.value ? 'owner.selfServeOnQ' : 'owner.selfServeOffQ')}</p>
            {confirm.value && <p className="text-amber-200 text-xs mb-3">⚠️ {t('owner.selfServeWarn')}</p>}
            {confirm.error && <p className="text-red-300 text-sm mb-2">{confirm.error}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary text-sm" onClick={() => setConfirm(null)}>{t('common.cancel')}</button>
              <button type="button" className="btn-primary text-sm" disabled={busy} onClick={apply}>{t('owner.confirm')}</button>
            </div>
          </>
        )}
      </Modal>
    </OwnerShell>
  );
}
