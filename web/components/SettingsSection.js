'use client';
import Hint from '@/components/ui/Hint';
import UiIcon from '@/components/ui/UiIcon';

// One block of a settings page: a line icon (a UiIcon name; `tone` is kept for old callers), title and description on the left (on wide
// screens), the controls in a card on the right.
export default function SettingsSection({ id, icon, title, description, tone = 'lime', danger = false, hidden = false, children }) {
  if (hidden) return null;
  return (
    <section id={id} className="scroll-mt-24 py-3">
      <div className="flex items-center gap-2.5 mb-3">
        <UiIcon name={icon} className={`w-5 h-5 ${danger ? 'text-bad-fg' : 'text-gray-400'}`} />
        <h2 className={`font-semibold flex-1 ${danger ? 'text-bad-fg' : 'text-white'}`}>{title}</h2>
        {description && <Hint inline text={description} />}
      </div>
      <div className={`card ${danger ? '!border-bad-line' : ''}`}>{children}</div>
    </section>
  );
}
