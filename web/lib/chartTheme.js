// Chart colours, one set for every chart (dark card surface #16223b). The data hue is a
// deeper lime than the brand's #B6F03B (which is too light to carry bars and lines); the
// second series is a quiet slate, so a chart reads as one hue plus a neutral. Gridlines and
// axis text match the app's tokens (--c-line, --c-faint).
export const DATA = '#72A313';
export const DATA_2 = '#5b7aa8';
export const DATA_3 = '#8a97ab';
export const NEGATIVE = '#c2554a';
export const GRID = '#1e2f4d';
export const INK_MUTED = '#97a2b5';
export const INK = '#e6ecf5';
export const SURFACE = '#16223b';
// Axis text: 12px, never smaller; a phone shows fewer x labels (Recharts `minTickGap`).
export const TICK = { fill: INK_MUTED, fontSize: 12 };
