'use client';
import Hint from '@/components/ui/Hint';

// One block of a settings page: an icon tile, title and description on the left (on wide
// screens), the controls in a card on the right.
export default function SettingsSection({ id, icon, title, description, tone = 'lime', danger = false, hidden = false, children }) {
  if (hidden) return null;
  const tile = {
    lime: 'bg-lime-400/15 text-lime-300',
    sky: 'bg-sky-400/15 text-sky-300',
    amber: 'bg-amber-400/15 text-amber-300',
    violet: 'bg-violet-400/15 text-violet-300',
    red: 'bg-red-500/15 text-red-300',
  }[danger ? 'red' : tone];
  return (
    <section id={id} className="scroll-mt-24 py-3">
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-base ${tile}`} aria-hidden="true">{icon}</span>
        <h2 className={`font-semibold flex-1 ${danger ? 'text-red-300' : 'text-white'}`}>{title}</h2>
        {description && <Hint inline text={description} />}
      </div>
      <div className={`card ${danger ? 'border-red-500/40' : ''}`}>{children}</div>
    </section>
  );
}
