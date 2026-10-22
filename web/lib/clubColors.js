// The calendar tells clubs apart by a small dot only; every block sits on the same quiet
// navy chip so the lime accent stays for what needs a decision. Four dot colours, reused
// in list order (both sports share them). (Full class strings so Tailwind keeps them.)
const CHIP = 'bg-navy-700 border-navy-600 text-white';
const DOTS = ['bg-lime-400', 'bg-sky-300', 'bg-amber-300', 'bg-gray-300'];
const PALETTE = {
  pickleball: DOTS.map((dot) => ({ chip: CHIP, dot })),
  badminton: DOTS.map((dot) => ({ chip: CHIP, dot })),
};

// club id -> { chip, dot }: clubs of a sport take that sport's colours in list order.
export function clubTones(clubs) {
  const map = {};
  (clubs || []).forEach((c, i) => {
    const sport = c.sport === 'badminton' ? 'badminton' : 'pickleball';
    map[c.id] = PALETTE[sport][i % PALETTE[sport].length];
  });
  return map;
}

// How the status shows on a club-coloured block: completed fades, cancelled is struck out.
export const STATUS_MOD = { completed: 'opacity-55', cancelled: 'opacity-55 line-through' };
