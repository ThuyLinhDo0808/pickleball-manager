/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './context/**/*.{js,jsx}'],
  theme: {
    extend: {
      // One face for the whole app (landing page included), self-hosted from @fontsource.
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      colors: {
        // Lighter greys than Tailwind's own: small print stays readable on the dark navy.
        gray: {
          400: '#b4becd',
          500: '#97a2b5',
        },
        navy: {
          950: '#0B1220',
          900: '#101a2e',
          800: '#16223b',
          700: '#1e2f4d',
          600: '#28406b',
        },
        lime: {
          400: '#B6F03B',
          500: '#a3dc2c',
        },
        // Status pairs: a pale tint (bg) with text of the same hue (fg). Use these, not raw
        // red / amber / emerald, so "good", "bad" and "needs attention" look the same everywhere.
        good: { fg: '#86efac', bg: 'rgba(34,197,94,0.14)', line: 'rgba(34,197,94,0.35)' },
        bad: { fg: '#fca5a5', bg: 'rgba(239,68,68,0.14)', line: 'rgba(239,68,68,0.35)' },
        warn: { fg: '#fcd34d', bg: 'rgba(245,158,11,0.14)', line: 'rgba(245,158,11,0.35)' },
        // Text roles on the navy ground.
        ink: { DEFAULT: '#e6ecf5', muted: '#b4becd', faint: '#97a2b5' },
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
