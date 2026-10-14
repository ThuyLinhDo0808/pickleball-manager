'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import MatchForm from '@/components/MatchForm';
import MatchList from '@/components/MatchList';
import DuprExport from '@/components/DuprExport';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

export default function ClubMatchesPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const { data: matches, loading, reload } = useLoad(
    () => (club ? api.get(`/api/matches?club_id=${club.id}`) : Promise.resolve([])),
    [club?.id]
  );
  const { data: members } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/members`) : Promise.resolve([])),
    [club?.id]
  );
  const [showAdd, setShowAdd] = useState(false);

  const players = (members || [])
    .filter((m) => m.is_active)
    .map((m) => ({ id: m.id, name: m.full_name, gender: m.gender }));

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-white text-2xl font-bold">{t('matches.title')}</h1>
        <button
          className="btn-primary w-10 h-10 !p-0 text-2xl leading-none flex items-center justify-center"
          aria-label={t('matches.add')}
          title={t('matches.add')}
          disabled={!club}
          onClick={() => setShowAdd(true)}
        >
          +
        </button>
      </div>

      {loading ? <p className="text-gray-400 text-sm">{t('common.loading')}</p> : <MatchList matches={matches || []} onChanged={reload} />}
      {club && (club.sport || 'pickleball') === 'pickleball' && <DuprExport clubId={club.id} scope={{ scope: 'club' }} fileName={`dupr-${club.name}`} reloadKey={JSON.stringify((matches || []).map((m) => [m.id, m.team1_score, m.team2_score]))} />}

      <Modal open={showAdd} title={t('matches.add')} onClose={() => setShowAdd(false)}>
        {showAdd && club && (
          <MatchForm
            players={players}
            idField="club_member_id"
            parent={{ club_id: club.id }}
            onCancel={() => setShowAdd(false)}
            onSaved={() => {
              setShowAdd(false);
              reload();
            }}
          />
        )}
      </Modal>
    </AppShell>
  );
}
