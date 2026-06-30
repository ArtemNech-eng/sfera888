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
  // AI_Design_Flagship lives at a single canonical address: `/dizajn`.
  // The historical entry points `/ai-design` and `/hochu-takzhe` (and their
  // wrapper pages / components) have been removed entirely — there is one and
  // only one AI-design URL, so no redirects are configured.
};

export default nextConfig;
