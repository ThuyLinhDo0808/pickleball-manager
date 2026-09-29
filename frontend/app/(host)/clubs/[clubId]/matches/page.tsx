'use client';
import { use, useMemo, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { api } from '@/lib/services/api';
import { useLoad } from '@/lib/hooks/useLoad';
import { useI18n } from '@/lib/i18n';
import { formatDateTime } from '@/lib/utils/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { toast } from 'sonner';

export default function MatchesPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = use(params);
  const { t } = useI18n();
  const { data, error, loading, reload } = useLoad(async () => {
    const [m, mt] = await Promise.all([
      api.get(`/api/clubs/${clubId}/members`),
      api.get(`/api/matches?club_id=${clubId}`),
    ]);
    return { members: m.members, matches: mt.matches };
  }, [clubId]);

  const [matchType, setMatchType] = useState('doubles');
  const [team1, setTeam1] = useState<string[]>([]);
  const [team2, setTeam2] = useState<string[]>([]);
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [saving, setSaving] = useState(false);

  const need = matchType === 'singles' ? 1 : 2;
  const active = useMemo(() => (data?.members || []).filter((m: any) => m.status === 'active'), [data]);
  const nameOf = useMemo(() => {
    const map: any = {};
    (data?.members || []).forEach((m: any) => { map[m.id] = m.display_name; });
    return map;
  }, [data]);

  if (loading) return <div className="p-8 text-center">Đang tải...</div>;
  if (error && !data) return <div className="p-8 text-center text-destructive">Lỗi tải dữ liệu</div>;

  function changeType(next: string) {
    const n = next === 'singles' ? 1 : 2;
    setMatchType(next);
    setTeam1((x) => x.slice(0, n));
    setTeam2((x) => x.slice(0, n));
  }

  function toggle(team: number, id: string) {
    const [mine, setMine, other] = team === 1 ? [team1, setTeam1, team2] : [team2, setTeam2, team1];
    if (other.includes(id)) return;
    if (mine.includes(id)) setMine(mine.filter((x) => x !== id));
    else if (mine.length < need) setMine([...mine, id]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const a = Number(s1);
    const b = Number(s2);
    if (team1.length !== need || team2.length !== need) return alert(t('match.needPlayers', { n: need }));
    if (s1 === '' || s2 === '' || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return alert(t('match.scoreWhole'));
    if (a === b) return alert(t('match.noTie'));

    try {
      setSaving(true);
      await api.post('/api/matches', {
        club_id: clubId, match_type: matchType, team1_score: a, team2_score: b,
        team1_player_ids: team1, team2_player_ids: team2,
      });
      setTeam1([]); setTeam2([]); setS1(''); setS2('');
      toast.success(t('match.saved'));
      reload();
    } catch (err: any) {
      toast.error(t('match.saveFailed') + ': ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function removeMatch(matchId: string) {
    if (window.confirm(t('match.deleteBody'))) {
      api.del(`/api/matches/${matchId}`)
        .then(() => { toast.success(t('match.deleted')); reload(); })
        .catch((err: any) => toast.error(t('match.deleteFailed') + ': ' + err.message));
    }
  }

  const teamNames = (match: any, team: number) =>
    match.match_players.filter((p: any) => p.team === team).map((p: any) => nameOf[p.club_member_id] || '?').join(' & ');

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <h2 className="text-xl font-bold">{t('match.logTitle')}</h2>

      <Segmented
        value={matchType}
        onChange={changeType}
        options={[{ value: 'singles', label: t('match.singles') }, { value: 'doubles', label: t('match.doubles') }, { value: 'mixed', label: t('match.mixed') }]}
      />

      {active.length < need * 2 ? (
        <Card className="text-center py-10 text-muted-foreground">{t('match.needMembersBody', { n: need * 2 })}</Card>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <TeamPicker title={`${t('match.team1')} (${team1.length}/${need})`} members={active} selected={team1} blocked={team2} onToggle={(id: string) => toggle(1, id)} />
          <TeamPicker title={`${t('match.team2')} (${team2.length}/${need})`} members={active} selected={team2} blocked={team1} onToggle={(id: string) => toggle(2, id)} />

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('match.team1Score')}</label>
              <input type="number" value={s1} onChange={(e) => setS1(e.target.value)} placeholder="0" required className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <span className="text-xl font-bold pt-5">–</span>
            <div className="flex-1">
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('match.team2Score')}</label>
              <input type="number" value={s2} onChange={(e) => setS2(e.target.value)} placeholder="0" required className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          <Button type="submit" title={t('match.save')} icon={Check} loading={saving} className="w-full" />
        </form>
      )}

      <div className="space-y-3 pt-6">
        <h3 className="font-bold text-base">{t('match.recent')}</h3>
        {data.matches.length === 0 ? (
          <Card className="text-center py-8 text-muted-foreground">{t('match.emptyTitle')}</Card>
        ) : (
          <div className="space-y-2">
            {data.matches.map((m: any) => (
              <Card key={m.id} className="relative group">
                <div className="space-y-1.5 pr-8">
                  {[1, 2].map((team) => {
                    const won = m.winner_team === team;
                    return (
                      <div key={team} className="flex justify-between items-center text-sm">
                        <span className={`font-bold truncate ${won ? 'text-primary' : 'text-muted-foreground'}`}>{teamNames(m, team)}</span>
                        <span className={`font-bold ${won ? 'text-primary' : ''}`}>{team === 1 ? m.team1_score : m.team2_score}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">{t(`match.${m.match_type}`)} · {formatDateTime(m.played_at)}</p>
                <button onClick={() => removeMatch(m.id)} className="absolute top-4 right-4 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamPicker({ title, members, selected, blocked, onToggle }: any) {
  return (
    <Card>
      <h4 className="font-bold text-sm text-primary mb-3">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {members.map((m: any) => {
          const off = blocked.includes(m.id);
          const active = selected.includes(m.id);
          return (
            <button
              type="button"
              key={m.id}
              disabled={off}
              onClick={() => onToggle(m.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${off ? 'opacity-30 cursor-not-allowed bg-muted' : active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:bg-muted'}`}
            >
              {m.display_name}
            </button>
          );
        })}
      </div>
    </Card>
  );
}