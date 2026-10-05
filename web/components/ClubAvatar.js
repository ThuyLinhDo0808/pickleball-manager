// A club's round avatar: initials on a colour picked from the club id (stable across the
// app), the sport in a corner and, optionally, the role ribbon under it.
const PALETTE = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#f97316', '#6366f1', '#ec4899', '#84cc16'];

function colorOf(id = '') {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initials(name = '?') {
  const words = String(name).replace(/^(clb|club|cl b)\s+/i, '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase();
}

export default function ClubAvatar({ id, name, sport, size = 56, icon = null, ring = '' }) {
  const bg = icon ? '#1e2f4d' : colorOf(id || name);
  return (
    <span className={`relative inline-flex shrink-0 rounded-2xl ${ring}`} style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full items-center justify-center rounded-2xl font-black text-white"
        style={{ background: bg, fontSize: Math.round(size * (icon ? 0.45 : 0.34)) }}
        aria-hidden="true"
      >
        {icon || initials(name)}
      </span>
      {sport && !icon && (
        <span className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-navy-900 border border-navy-700" style={{ width: size * 0.42, height: size * 0.42, fontSize: size * 0.24 }} aria-hidden="true">
          {sport === 'badminton' ? '🏸' : '🏓'}
        </span>
      )}
    </span>
  );
}
