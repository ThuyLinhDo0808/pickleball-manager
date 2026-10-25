// The colour palette for both themes. Dark is the original NexusZone look (navy + lime);
// light keeps the lime accent and turns the navy ground, grey text and the pale status
// tints around so the same Tailwind classes read well on white.
// Used by tailwind.config.js (class -> CSS variable) and scripts/gen-theme.js (theme.css).
const tw = require('tailwindcss/colors');

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const HUES = ['red', 'amber', 'sky', 'yellow', 'orange', 'emerald', 'pink', 'slate', 'violet', 'green', 'blue', 'rose', 'purple', 'teal', 'cyan', 'indigo'];

const navyDark = { 950: '#0B1220', 900: '#101a2e', 800: '#16223b', 700: '#1e2f4d', 600: '#28406b', 500: '#3b5585', 400: '#5b7aa8' };
const navyLight = { 950: '#f3f5f9', 900: '#f8fafc', 800: '#ffffff', 700: '#e2e8f0', 600: '#cbd5e1', 500: '#94a3b8', 400: '#64748b' };

const grayDark = { ...tw.gray, 400: '#b4becd', 500: '#97a2b5' };
// Light: text greys get darker (gray-300 body text -> slate-700), panel greys lighter.
const grayLight = { 50: '#030712', 100: '#0f172a', 200: '#1e293b', 300: '#334155', 400: '#475569', 500: '#5b6779', 600: '#94a3b8', 700: '#cbd5e1', 800: '#e2e8f0', 900: '#f1f5f9', 950: '#f8fafc' };

const DARK = {};
const LIGHT = {};
const put = (name, dark, light) => {
  DARK[name] = dark;
  LIGHT[name] = light;
};

for (const s of Object.keys(navyDark)) put(`navy-${s}`, navyDark[s], navyLight[s]);
for (const s of SHADES) put(`gray-${s}`, grayDark[s], grayLight[s]);
// Lime stays bright for buttons and fills; lime *text* is darkened in globals.css.
for (const s of SHADES) put(`lime-${s}`, s === 400 ? '#B6F03B' : s === 500 ? '#a3dc2c' : tw.lime[s], s === 400 ? '#B6F03B' : s === 500 ? '#a3dc2c' : tw.lime[s]);
// Other hues: pale shades (text on dark) swap with deep shades (text on light), e.g.
// text-red-300 -> red-700, bg-red-900/40 -> red-100/40.
for (const h of HUES) for (const s of SHADES) put(`${h}-${s}`, tw[h][s], tw[h][s === 500 ? 500 : 1000 - s] || tw[h][s]);
put('white', '#ffffff', '#0f172a');
put('ink', '#e6ecf5', '#0f172a');
put('ink-muted', '#b4becd', '#475569');
put('ink-faint', '#97a2b5', '#5b6779');
put('good-fg', '#86efac', '#15803d');
put('bad-fg', '#fca5a5', '#b91c1c');
put('warn-fg', '#fcd34d', '#b45309');

module.exports = { DARK, LIGHT, SHADES, HUES };
