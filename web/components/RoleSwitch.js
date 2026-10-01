'use client';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace, WORKSPACE_HOME } from '@/context/WorkspaceContext';

// One account can run clubs and also play: switch between the manager side (Club / Xé Vé)
// and the player portal. The last choice opens next time (see app/page.js).
export const MODE_KEY = 'pickleball_mode';

export function rememberMode(mode) {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export default function RoleSwitch({ current, compact = false }) {
  const { t } = useI18n();
  const router = useRouter();
  const { workspace } = useWorkspace();
  function go(mode) {
    if (mode === current) return;
    rememberMode(mode);
    router.push(mode === 'player' ? '/p' : WORKSPACE_HOME[workspace] || '/dashboard');
  }
  if (compact) {
    const other = current === 'player' ? 'manage' : 'player';
    return (
      <button
        type="button"
        onClick={() => go(other)}
        title={t(`mode.${other}`)}
        aria-label={t(`mode.${other}`)}
        className="h-10 flex items-center justify-center rounded-lg text-base bg-navy-800 hover:bg-navy-700"
      >
        {other === 'player' ? '👤' : '🛠'}
      </button>
    );
  }
  return (
    <div role="tablist" aria-label={t('mode.label')} className="grid grid-cols-2 bg-navy-950 rounded-lg p-1 text-xs font-semibold border border-navy-700">
      {['manage', 'player'].map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={current === m}
          onClick={() => go(m)}
          className={`rounded-md py-1.5 px-2 whitespace-nowrap transition ${current === m ? 'bg-sky-400 text-navy-950' : 'text-gray-400 hover:text-white'}`}
        >
          {m === 'manage' ? '🛠 ' : '👤 '}
          {t(`mode.${m}`)}
        </button>
      ))}
    </div>
  );
}
