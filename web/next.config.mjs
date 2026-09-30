/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
