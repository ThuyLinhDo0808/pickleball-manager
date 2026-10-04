'use client';

// One block of a settings page: an icon tile, title and description on the left (on wide
// screens), the controls in a card on the right.
export default function SettingsSection({ id, icon, title, description, tone = 'lime', danger = false, children }) {
  const tile = {
    lime: 'bg-lime-400/15 text-lime-300',
    sky: 'bg-sky-400/15 text-sky-300',
    amber: 'bg-amber-400/15 text-amber-300',
    violet: 'bg-violet-400/15 text-violet-300',
    red: 'bg-red-500/15 text-red-300',
  }[danger ? 'red' : tone];
  return (
    <section id={id} className="scroll-mt-24 grid gap-4 lg:grid-cols-[18rem_1fr] py-6 border-t border-navy-700 first:border-t-0">
      <div className="flex lg:flex-col gap-3 items-start">
        <span className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-lg ${tile}`} aria-hidden="true">{icon}</span>
        <div className="min-w-0">
          <h2 className={`font-semibold ${danger ? 'text-red-300' : 'text-white'}`}>{title}</h2>
          {description && <p className="text-gray-400 text-sm mt-0.5 leading-relaxed">{description}</p>}
        </div>
      </div>
      <div className={`card !p-5 ${danger ? 'border-red-500/40' : ''}`}>{children}</div>
    </section>
  );
}
