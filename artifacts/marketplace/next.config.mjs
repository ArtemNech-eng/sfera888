/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Marketplace is mounted as its own service. The default port (3000) and
  // origin are configured by the deploy environment, not at build time.
  experimental: {
    // Server actions are off — we use a tiny route handler instead.
    serverActions: { bodySizeLimit: "256kb" },
  },
};

export default nextConfig;
