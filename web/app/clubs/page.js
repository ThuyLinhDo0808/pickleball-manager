'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import CreateClubForm from '@/components/CreateClubForm';
import ClubPaymentSettings from '@/components/ClubPaymentSettings';
import ClubProfileSettings from '@/components/ClubProfileSettings';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/useLoad';
import { clubTones } from '@/lib/clubColors';
import { todayYmd } from '@/lib/dates';

export default function ClubsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { clubs, club: current, loading, selectClub, updateClub, deleteClub } = useClubs();
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');
  const [settingsId, setSettingsId] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [creating, setCreating] = useState(false);
  const tones = clubTones(clubs);

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

  // Deleting a club: show what goes with it, and ask for the club's name before deleting.
  const [deleting, setDeleting] = useState(null); // { club, preview }
  const [typed, setTyped] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState('');
  async function remove(c) {
    setTyped('');
    setDelError('');
    setDeleting({ club: c, preview: null });
    try {
      const preview = await api.get(`/api/clubs/${c.id}/delete-preview`);
      setDeleting({ club: c, preview });
    } catch (err) {
      setDelError(err.message);
    }
  }
  async function confirmDelete() {
    setDelBusy(true);
    setDelError('');
    try {
      await deleteClub(deleting.club.id, typed);
      setDeleting(null);
    } catch (err) {
      setDelError(err.message);
    } finally {
      setDelBusy(false);
    }
  }

  return (
    <AppShell>
      <Modal open={!!deleting} title={t('clubs.deleteTitle')} onClose={() => setDeleting(null)}>
        {deleting && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-gray-200">{t('clubs.deleteIntro', { name: deleting.club.name })}</p>
            {deleting.preview && (
              <ul className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-red-200 list-disc list-inside">
                <li>{t('clubs.delMembers', { n: deleting.preview.members })}</li>
                <li>{t('clubs.delEvents', { n: deleting.preview.events })}</li>
                <li>{t('clubs.delTournaments', { n: deleting.preview.tournaments })}</li>
                <li>{t('clubs.delMoney', { n: deleting.preview.transactions })}</li>
              </ul>
            )}
            <label htmlFor="del-club-name" className="text-gray-300">{t('clubs.deleteType', { name: deleting.club.name })}</label>
            <input id="del-club-name" className="input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={deleting.club.name} />
            {delError && <p className="text-red-400">{delError}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary" onClick={() => setDeleting(null)}>{t('common.cancel')}</button>
              <button
                type="button"
                className="rounded-lg px-3 py-2 font-semibold bg-red-500 text-white disabled:opacity-40"
                disabled={delBusy || typed.trim() !== deleting.club.name.trim()}
                onClick={confirmDelete}
              >
                🗑 {t('clubs.deleteForever')}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-white text-2xl font-bold">{t('clubs.title')}</h1>
          <p className="text-gray-400 text-sm">{t('clubsX.lead', { n: clubs.length })}</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>+ {t('clubs.create')}</button>
      </div>

      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {!loading && clubs.length === 0 && (
        <div className="card !p-8 text-center max-w-xl mx-auto">
          <div className="text-5xl mb-2" aria-hidden="true">🏓</div>
          <h2 className="text-white text-lg font-semibold">{t('clubsX.emptyTitle')}</h2>
          <p className="text-gray-400 text-sm mt-1 mb-5">{t('clubs.none')}</p>
          <div className="text-left"><CreateClubForm onCreated={() => router.push('/dashboard')} autoFocus /></div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {clubs.map((c) => (
          <ClubCard
            key={c.id}
            club={c}
            tone={tones[c.id]}
            current={c.id === current?.id}
            editing={editingId === c.id}
            editName={editName}
            setEditName={setEditName}
            onSaveRename={saveRename}
            onCancelRename={() => setEditingId(null)}
            onSelect={() => selectClub(c.id)}
            onOpen={() => {
              selectClub(c.id);
              router.push('/dashboard');
            }}
            onSettings={() => setSettingsId(c.id)}
            onProfile={() => setProfileId(c.id)}
            onRename={() => startRename(c)}
            onDelete={() => remove(c)}
          />
        ))}
      </div>

      <Modal open={creating} title={t('clubs.create')} onClose={() => setCreating(false)}>
        {creating && <CreateClubForm onCreated={() => { setCreating(false); router.push('/dashboard'); }} autoFocus />}
      </Modal>
      <Modal open={!!profileId} title={t('clubProfile.title')} onClose={() => setProfileId(null)}>
        {profileId && clubs.find((c) => c.id === profileId) && (
          <ClubProfileSettings club={clubs.find((c) => c.id === profileId)} onDone={() => setProfileId(null)} />
        )}
      </Modal>
      <Modal open={!!settingsId} title={t('payments.settings')} onClose={() => setSettingsId(null)}>
        {settingsId && clubs.find((c) => c.id === settingsId) && (
          <ClubPaymentSettings club={clubs.find((c) => c.id === settingsId)} onDone={() => setSettingsId(null)} />
        )}
      </Modal>
    </AppShell>
  );
}

// One club: colour band, initial, sport, quick numbers, and what you can do with it.
function ClubCard({ club: c, tone, current, editing, editName, setEditName, onSaveRename, onCancelRename, onSelect, onOpen, onSettings, onProfile, onRename, onDelete }) {
  const { t, lang } = useI18n();
  const { data: members } = useLoad(() => api.get(`/api/clubs/${c.id}/members`).catch(() => null), [c.id]);
  const { data: events } = useLoad(() => api.get(`/api/clubs/${c.id}/events`).catch(() => null), [c.id]);
  const today = todayYmd();
  const fixed = (members || []).filter((m) => m.member_type === 'fixed' && m.is_active !== false).length;
  const guests = (members || []).filter((m) => m.member_type !== 'fixed' && m.is_active !== false).length;
  const next = (events || []).find((e) => e.event_date >= today && !['cancelled', 'completed'].includes(e.status));
  const owner = !c.role || c.role === 'owner';
  return (
    <div className={`card !p-0 overflow-hidden flex flex-col ${current ? 'ring-2 ring-lime-400/70' : ''}`}>
      <div className={`h-2 ${tone?.dot || 'bg-lime-400'}`} />
      <div className="p-5 flex flex-col gap-4 flex-1">
        <div className="flex items-start gap-3">
          <span className={`h-12 w-12 shrink-0 rounded-xl flex items-center justify-center text-xl font-bold border ${tone?.chip || ''}`}>
            {c.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            {editing ? (
              <form onSubmit={onSaveRename} className="flex flex-col gap-2">
                <input className="input" autoFocus maxLength={80} value={editName} onChange={(e) => setEditName(e.target.value)} aria-label={t('clubs.rename')} />
                <div className="flex gap-2">
                  <button className="btn-primary text-sm">{t('common.save')}</button>
                  <button type="button" className="btn-secondary text-sm" onClick={onCancelRename}>{t('common.cancel')}</button>
                </div>
              </form>
            ) : (
              <>
                <h2 className="text-white font-semibold text-lg truncate">{c.name}</h2>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span className="text-[11px] rounded-full border border-navy-500 text-gray-300 px-2 py-0.5">{t(`clubs.sport_${c.sport || 'pickleball'}`)}</span>
                  {current && <span className="text-[11px] bg-lime-400 text-navy-950 font-semibold rounded-full px-2 py-0.5">{t('clubs.current')}</span>}
                  {!owner && <span className="text-[11px] border border-sky-400/60 text-sky-300 rounded-full px-2 py-0.5">{t(`staff.${c.role}`)}</span>}
                </div>
              </>
            )}
          </div>
        </div>
        {c.description && <p className="text-gray-400 text-sm -mt-1 line-clamp-2">{c.description}</p>}

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            [members ? fixed : '…', t('clubsX.fixed')],
            [members ? guests : '…', t('clubsX.guests')],
            [events ? events.filter((e) => e.event_date.startsWith(today.slice(0, 7)) && e.status !== 'cancelled').length : '…', t('clubsX.sessionsMonth')],
          ].map(([v, k]) => (
            <div key={k} className="rounded-xl bg-navy-900 py-2">
              <div className="text-white font-bold tabular-nums">{v}</div>
              <div className="text-gray-400 text-[11px]">{k}</div>
            </div>
          ))}
        </div>

        <div className="text-xs text-gray-400 flex flex-col gap-1">
          <span>
            📅 {t('clubsX.next')}:{' '}
            <span className="text-gray-200">
              {next ? `${new Date(`${next.event_date}T00:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'short', day: '2-digit', month: '2-digit' })} · ${next.title}` : t('clubsX.noNext')}
            </span>
          </span>
          <span>
            {owner ? `🗓 ${t('clubs.created', { date: new Date(c.created_at).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB') })}` : `🤝 ${t('coadmin.sharedBy', { owner: c.owner_email || '—' })}`}
          </span>
        </div>

        <div className="mt-auto pt-3 border-t border-navy-700 flex flex-wrap items-center gap-2">
          {current ? (
            <button className="btn-primary text-sm" onClick={onOpen}>{t('clubsX.open')} →</button>
          ) : (
            <button className="btn-primary text-sm" onClick={onSelect}>{t('clubs.switchTo')}</button>
          )}
          {/* Co-admins can do everything but delete the club. */}
          <button className="btn-secondary text-sm" onClick={onProfile}>🪪 {t('clubProfile.button')}</button>
          <button className="btn-secondary text-sm" onClick={onSettings}>💳 {t('payments.settings')}</button>
          <button className="btn-secondary text-sm" onClick={onRename}>✏️ {t('clubs.rename')}</button>
          {owner && <button className="text-red-400 hover:text-red-300 text-sm px-2 ml-auto" onClick={onDelete}>🗑 {t('common.delete')}</button>}
        </div>
      </div>
    </div>
  );
}
