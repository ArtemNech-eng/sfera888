/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // When the cabinet is served through a reverse proxy on sfera-master.ru,
  // JS/CSS assets must load directly from chestnye-mastera.ru (assetPrefix)
  // so the browser never asks sfera-master.ru for /_next/static/* files.
  // For direct access (chestnye-mastera.ru) this resolves to the same origin
  // — no functional change, just makes asset URLs absolute.
  // Set ASSET_PREFIX=https://chestnye-mastera.ru on the Railway marketplace service.
  assetPrefix: process.env.ASSET_PREFIX ?? "",
  experimental: {
    serverActions: { bodySizeLimit: "256kb" },
  },
};

export default nextConfig;
