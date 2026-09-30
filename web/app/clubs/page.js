'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import CreateClubForm from '@/components/CreateClubForm';
import ClubPaymentSettings from '@/components/ClubPaymentSettings';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';

export default function ClubsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { clubs, club: current, loading, selectClub, updateClub, deleteClub } = useClubs();
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');
  const [settingsId, setSettingsId] = useState(null);

  function startRename(c) {
    setEditingId(c.id);
    setEditName(c.name);
    setError('');
  }

  async function saveRename(e) {
    e.preventDefault();
    const name = editName.trim();
    if (!name) return;
    try {
      await updateClub(editingId, { name });
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(c) {
    if (!window.confirm(t('clubs.deleteConfirm', { name: c.name }))) return;
    try {
      await deleteClub(c.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-4">{t('clubs.title')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="card lg:col-span-1 lg:order-2">
          <h2 className="text-white font-semibold mb-3">{t('clubs.create')}</h2>
          <CreateClubForm onCreated={() => router.push('/dashboard')} autoFocus={!loading && clubs.length === 0} />
        </div>

        <div className="lg:col-span-2 lg:order-1 flex flex-col gap-3">
          {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
          {!loading && clubs.length === 0 && <p className="text-gray-400 text-sm">{t('clubs.none')}</p>}
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {clubs.map((c) => {
            const isCurrent = c.id === current?.id;
            return (
              <div key={c.id} className={`card ${isCurrent ? 'border-lime-400' : ''}`}>
                {editingId === c.id ? (
                  <form onSubmit={saveRename} className="flex flex-col sm:flex-row gap-2">
                    <input className="input" autoFocus maxLength={80} value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <div className="flex gap-2">
                      <button className="btn-primary flex-1 sm:flex-none">{t('common.save')}</button>
                      <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={() => setEditingId(null)}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-white font-semibold truncate">{c.name}</div>
                        {c.description && <p className="text-gray-400 text-sm mt-0.5">{c.description}</p>}
                        <p className="text-gray-500 text-xs mt-1">
                          {c.role === 'co_admin'
                            ? t('coadmin.sharedBy', { owner: c.owner_email || '—' })
                            : t('clubs.created', { date: new Date(c.created_at).toLocaleDateString() })}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {isCurrent && (
                          <span className="text-xs bg-lime-400 text-navy-950 font-semibold rounded-full px-2 py-0.5">{t('clubs.current')}</span>
                        )}
                        {c.role === 'co_admin' && (
                          <span className="text-xs border border-sky-400/60 text-sky-300 rounded-full px-2 py-0.5">{t('staff.co_admin')}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {!isCurrent && (
                        <button className="btn-primary text-sm flex-1 sm:flex-none" onClick={() => selectClub(c.id)}>
                          {t('clubs.switchTo')}
                        </button>
                      )}
                      {c.role !== 'co_admin' && (
                        <>
                          <button className="btn-secondary text-sm flex-1 sm:flex-none" onClick={() => setSettingsId(c.id)}>
                            {t('payments.settings')}
                          </button>
                          <button className="btn-secondary text-sm flex-1 sm:flex-none" onClick={() => startRename(c)}>
                            {t('clubs.rename')}
                          </button>
                          <button className="text-red-400 text-sm px-3 py-2" onClick={() => remove(c)}>
                            {t('common.delete')}
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Modal open={!!settingsId} title={t('payments.settings')} onClose={() => setSettingsId(null)}>
        {settingsId && clubs.find((c) => c.id === settingsId) && (
          <ClubPaymentSettings club={clubs.find((c) => c.id === settingsId)} onDone={() => setSettingsId(null)} />
        )}
      </Modal>
    </AppShell>
  );
}
