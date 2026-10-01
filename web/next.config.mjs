/** @type {import('next').NextConfig} */

// Where the browser is allowed to connect: our API and Supabase (sign-in only).
const origin = (u) => {
  try {
    return u ? new URL(u).origin : '';
  } catch {
    return '';
  }
};
const apiOrigin = origin(process.env.NEXT_PUBLIC_API_URL);
const supabaseOrigin = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const isDev = process.env.NODE_ENV !== 'production';

// Content-Security-Policy: only our own scripts, no framing, no plugins, and network calls
// only to the API + Supabase. 'unsafe-inline' is needed for Next's inline bootstrap script
// and React style props; images may be data:/blob: (QR codes, transfer screenshots) or
// https (VietQR images).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} ${supabaseOrigin}${isDev ? ' ws: http://localhost:*' : ''}`.replace(/\s+/g, ' ').trim(),
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src https://www.youtube-nocookie.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Event / ticket links carry secret tokens in the path: never send them to other sites.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera only for our own QR scanner.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The app never uses next/image: turn the image optimizer off (smaller attack surface).
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // Finance pages moved under one /finance section; keep old links working.
  async redirects() {
    return [
      { source: '/club/fund', destination: '/finance/ledger', permanent: true },
      { source: '/club/plans', destination: '/finance/plans', permanent: true },
      { source: '/club/inventory', destination: '/finance/inventory', permanent: true },
    ];
  },
};

export default nextConfig;
