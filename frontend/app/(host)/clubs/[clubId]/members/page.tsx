'use client';
import { use, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/services/api';
import { useLoad } from '@/lib/hooks/useLoad';
import { useI18n } from '@/lib/i18n';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/segmented';
import CapacityBanner from '@/components/host/CapacityBanner';
import { toast } from 'sonner';

export default function MembersPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = use(params);
  const { t } = useI18n();
  const { data, error, loading, reload } = useLoad(() => api.get(`/clubs/${clubId}/members`), [clubId]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<any>(null);

  const members = useMemo(() => (data?.members || []).filter((m: any) => m.status !== 'removed'), [data]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? members.filter((m: any) => m.display_name.toLowerCase().includes(q)) : members;
  }, [members, query]);

  if (loading) return <div className="p-8 text-center">Đang tải...</div>;
  if (error && !data) return <div className="p-8 text-center text-destructive">Lỗi tải dữ liệu</div>;

  const active = members.filter((m: any) => m.status === 'active');
  const guests = active.filter((m: any) => m.member_type === 'guest').length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <CapacityBanner />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <p className="text-sm text-muted-foreground">
          {t('members.summary', { active: active.length, fixed: active.length - guests, guests })}
        </p>
        <Button title={t('members.add')} icon={Plus} onClick={() => setEditing('new')} />
      </div>

      {members.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('members.search')}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}

      <div className="grid gap-3">
        {filtered.map((item: any) => (
          <Card key={item.id} onClick={() => setEditing(item)} className={`flex items-center gap-4 ${item.status === 'inactive' ? 'opacity-60' : ''}`}>
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0">
              {item.display_name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-base truncate">{item.display_name}</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.dupr_level != null ? `DUPR ${Number(item.dupr_level).toFixed(2)}` : t('members.noRating')}
                {item.phone ? ` · ${item.phone}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge label={item.member_type === 'fixed' ? t('type.fixed') : t('type.guest')} tone={item.member_type === 'fixed' ? 'info' : 'neutral'} />
              {item.status === 'inactive' && <Badge label={t('members.inactive')} tone="warn" />}
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <MemberModal clubId={clubId} member={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function MemberModal({ clubId, member, onClose, onDone }: any) {
  const { t } = useI18n();
  const isNew = member === 'new';
  const [name, setName] = useState(isNew ? '' : member.display_name);
  const [phone, setPhone] = useState(isNew ? '' : member.phone || '');
  const [dupr, setDupr] = useState(isNew || member.dupr_level == null ? '' : String(Number(member.dupr_level)));
  const [type, setType] = useState(isNew ? 'fixed' : member.member_type);
  const [status, setStatus] = useState(isNew ? 'active' : member.status);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return alert(t('members.nameRequired'));
    const rating = dupr.trim() ? Number(dupr.replace(',', '.')) : null;

    const payload: any = { display_name: name.trim(), phone: phone.trim() || null, dupr_level: rating, member_type: type };
    if (!isNew) payload.status = status;

    try {
      setSaving(true);
      if (isNew) {
        await api.post(`/clubs/${clubId}/members`, payload);
        toast.success(t('members.added', { name: payload.display_name }));
      } else {
        await api.patch(`/clubs/${clubId}/members/${member.id}`, payload);
        toast.success(t('common.saved'));
      }
      onDone();
    } catch (err: any) {
      toast.error(t('members.saveFailed') + ': ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (window.confirm(t('members.removeBody', { name: member.display_name }))) {
      try {
        await api.patch(`/api/clubs/${clubId}/members/${member.id}`, { status: 'removed' });
        toast.success(t('members.removed'));
        onDone();
      } catch (err: any) {
        toast.error(t('members.removeFailed') + ': ' + err.message);
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md bg-background">
        <h2 className="text-lg font-bold mb-4">{isNew ? t('members.addTitle') : t('members.editTitle')}</h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">{t('members.name')}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">{t('members.phone')}</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">{t('members.dupr')}</label>
            <input type="text" value={dupr} onChange={(e) => setDupr(e.target.value)} placeholder="3.50" className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">{t('members.type')}</label>
            <Segmented value={type} onChange={setType} options={[{ value: 'fixed', label: t('type.fixed') }, { value: 'guest', label: t('type.guest') }]} />
          </div>
          {!isNew && (
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('members.status')}</label>
              <Segmented value={status} onChange={setStatus} options={[{ value: 'active', label: t('members.active') }, { value: 'inactive', label: t('members.inactive') }]} />
            </div>
          )}
          <div className="flex justify-between items-center pt-2">
            {!isNew ? <Button type="button" variant="danger" title={t('members.remove')} onClick={remove} /> : <div />}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" title={t('common.cancel')} onClick={onClose} />
              <Button type="submit" title={isNew ? t('members.add') : t('common.save')} loading={saving} />
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}