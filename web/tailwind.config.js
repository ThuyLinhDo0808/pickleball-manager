/** @type {import('tailwindcss').Config} */
const { DARK } = require('./lib/themeColors');

const v = (name) => `rgb(var(--tw-c-${name}) / <alpha-value>)`;
// { navy: { 950: v('navy-950'), … }, gray: {…}, white: v('white'), … }
const palette = {};
for (const key of Object.keys(DARK)) {
  const m = /^([a-z]+)-(\d+)$/.exec(key);
  if (m) (palette[m[1]] = palette[m[1]] || {})[m[2]] = v(key);
}
palette.white = v('white');
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './context/**/*.{js,jsx}'],
  theme: {
    extend: {
      // The app font comes from --font-app (globals.css): system face on computers, Plus
      // Jakarta Sans (self-hosted from @fontsource) on phones.
      fontFamily: {
        sans: ['var(--font-app)'],
      },
      // Every colour is a CSS variable (app/theme.css, made from lib/themeColors.js), so the
      // light theme (html[data-theme="light"]) changes them all at once.
      colors: {
        ...palette,
        // Status pairs: a pale tint (bg) with text of the same hue (fg). Use these, not raw
        // red / amber / emerald, so "good", "bad" and "needs attention" look the same everywhere.
        good: { fg: v('good-fg'), bg: 'rgba(34,197,94,0.14)', line: 'rgba(34,197,94,0.35)' },
        bad: { fg: v('bad-fg'), bg: 'rgba(239,68,68,0.14)', line: 'rgba(239,68,68,0.35)' },
        warn: { fg: v('warn-fg'), bg: 'rgba(245,158,11,0.14)', line: 'rgba(245,158,11,0.35)' },
        // Text roles on the ground.
        ink: { DEFAULT: v('ink'), muted: v('ink-muted'), faint: v('ink-faint') },
      },
      fontSize: {
        // Named sizes: meta (small print, never below 12px), body (14px), title (page title).
        meta: ['0.75rem', { lineHeight: '1.35' }],
        body: ['0.875rem', { lineHeight: '1.5' }],
        title: ['1.5rem', { lineHeight: '1.2', fontWeight: '700' }],
      },
      borderRadius: {
        control: '0.5rem',
        card: '0.75rem',
        sheet: '1rem',
      },
    },
  },
  plugins: [],
};
