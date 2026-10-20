/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './context/**/*.{js,jsx}'],
  theme: {
    extend: {
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
      },
    },
  },
  plugins: [],
};