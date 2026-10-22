// Line icons (24×24, 2px stroke, same look as the side menu) for tabs, page titles and the
// main buttons — instead of emoji, which look different on every phone. Decorative: the
// word next to the icon says what it is, so the icon is hidden from screen readers.
const PATHS = {
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 014-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 01-4 4H4',
  paddle: 'M14.5 3.5a6 6 0 018.5 8.5l-5 5-8.5-8.5zM9.5 8.5l-6 6a2 2 0 000 3l3 3a2 2 0 003 0l6-6M5 22l-2-2',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  scan: 'M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 12h10',
  userPlus: 'M15 19a6 6 0 00-12 0M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6',
  users: 'M17 20a5 5 0 00-10 0M12 12a4 4 0 100-8 4 4 0 000 8zM22 20a4 4 0 00-4-4M17 4a4 4 0 010 8',
  wallet: 'M3 7h18v12H3zM3 11h18M16 15h2',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  money: 'M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  medal: 'M12 22a6 6 0 100-12 6 6 0 000 12zM8 2l2.5 8M16 2l-2.5 8M12 14v4',
  rankings: 'M8 21V11M16 21V7M12 21V3M4 21h16',
  globe: 'M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20',
  ticket: 'M4 7h16v3a2 2 0 000 4v3H4v-3a2 2 0 000-4zM12 7v10',
  members: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  court: 'M3 5h18v14H3zM12 5v14M3 12h18',
  pin: 'M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  clock: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',
  gift: 'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8c-1.5-3-5-3.5-5-1.5S9.5 8 12 8zM12 8c1.5-3 5-3.5 5-1.5S14.5 8 12 8z',
  bell: 'M18 16V11a6 6 0 00-12 0v5l-2 2h16zM10 21h4',
  move: 'M5 12h14M13 6l6 6-6 6',
  list: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  swords: 'M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 17.5L21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2',
  home: 'M3 11l9-8 9 8M5 9.5V21h14V9.5',
  hourglass: 'M6 2h12M6 22h12M7 2v4l5 6-5 6v4M17 2v4l-5 6 5 6v4',
  chat: 'M21 12a8 8 0 01-11.6 7.1L3 21l1.9-6.4A8 8 0 1121 12z',
  card: 'M2 6h20v12H2zM2 10h20',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  checkCircle: 'M12 22a10 10 0 100-20 10 10 0 000 20zM8 12l3 3 5-6',
  alert: 'M12 3l10 18H2zM12 10v4M12 17h.01',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  x: 'M6 6l12 12M18 6L6 18',
};

export const hasUiIcon = (name) => typeof name === 'string' && name in PATHS;

export default function UiIcon({ name, className = 'w-5 h-5' }) {
  if (!PATHS[name]) return null;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
