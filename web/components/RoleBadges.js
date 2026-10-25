'use client';
import UiIcon from '@/components/ui/UiIcon';
import { useI18n } from '@/context/I18nContext';

// Who holds a role in this club / community (they are players too): a small chip per role,
// icon + word, so the Host sees at a glance who is Host, đồng quản trị, tài chính…
const ROLE = {
  owner: { icon: 'crown', tone: 'border-amber-300/60 text-amber-200' },
  co_admin: { icon: 'shield', tone: 'border-sky-400/60 text-sky-200' },
  finance: { icon: 'wallet', tone: 'border-emerald-400/60 text-emerald-200' },
  operator: { icon: 'tool', tone: 'border-violet-400/60 text-violet-200' },
  coordinator: { icon: 'clipboard', tone: 'border-lime-400/60 text-lime-200' },
  referee: { icon: 'flag', tone: 'border-orange-400/60 text-orange-200' },
};

export default function RoleBadges({ roles }) {
  const { t } = useI18n();
  if (!roles?.length) return null;
  return (
    <>
      {roles.filter((r) => ROLE[r]).map((r) => (
        <span key={r} className={`inline-flex items-center gap-1 rounded-full border px-1.5 text-[11px] leading-5 whitespace-nowrap ${ROLE[r].tone}`} title={t(`clubLog.role_${r}`)}>
          <UiIcon name={ROLE[r].icon} className="w-3 h-3" />
          {r === 'owner' ? 'Host' : t(`clubLog.role_${r}`)}
        </span>
      ))}
    </>
  );
}
