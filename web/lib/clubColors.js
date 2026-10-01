// One colour per club on the calendar. Pickleball clubs take warm / green tones, badminton
// clubs cool blue / purple ones, so both the sport and the club read at a glance.
// (Full class strings so Tailwind keeps them.)
const PALETTE = {
  pickleball: [
    { chip: 'bg-lime-400/25 border-lime-400 text-lime-50', dot: 'bg-lime-400' },
    { chip: 'bg-amber-400/25 border-amber-400 text-amber-50', dot: 'bg-amber-400' },
    { chip: 'bg-emerald-400/25 border-emerald-400 text-emerald-50', dot: 'bg-emerald-400' },
    { chip: 'bg-orange-400/25 border-orange-400 text-orange-50', dot: 'bg-orange-400' },
    { chip: 'bg-yellow-300/25 border-yellow-300 text-yellow-50', dot: 'bg-yellow-300' },
    { chip: 'bg-rose-400/25 border-rose-400 text-rose-50', dot: 'bg-rose-400' },
  ],
  badminton: [
    { chip: 'bg-sky-400/25 border-sky-400 text-sky-50', dot: 'bg-sky-400' },
    { chip: 'bg-violet-400/25 border-violet-400 text-violet-50', dot: 'bg-violet-400' },
    { chip: 'bg-cyan-400/25 border-cyan-400 text-cyan-50', dot: 'bg-cyan-400' },
    { chip: 'bg-fuchsia-400/25 border-fuchsia-400 text-fuchsia-50', dot: 'bg-fuchsia-400' },
    { chip: 'bg-indigo-400/25 border-indigo-400 text-indigo-50', dot: 'bg-indigo-400' },
    { chip: 'bg-blue-400/25 border-blue-400 text-blue-50', dot: 'bg-blue-400' },
  ],
};

// club id -> { chip, dot }: clubs of a sport take that sport's colours in list order.
export function clubTones(clubs) {
  const used = { pickleball: 0, badminton: 0 };
  const map = {};
  for (const c of clubs || []) {
    const sport = c.sport === 'badminton' ? 'badminton' : 'pickleball';
    const list = PALETTE[sport];
    map[c.id] = list[used[sport]++ % list.length];
  }
  return map;
}

// How the status shows on a club-coloured block: completed fades, cancelled is struck out.
export const STATUS_MOD = { completed: 'opacity-55', cancelled: 'opacity-55 line-through' };
