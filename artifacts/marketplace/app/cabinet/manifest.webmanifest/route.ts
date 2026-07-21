import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 86400;

/**
 * PWA manifest for the cabinet shell. Served at
 * `/cabinet/manifest.webmanifest` and linked from the cabinet layout's
 * <head> via the layout's `metadata.manifest`. Mirrors the master-pwa
 * manifest, but scoped to `/cabinet/` so installing it from a public
 * marketplace page doesn't trap the user in the cabinet shell.
 *
 * Icons reuse master-pwa assets served by the api-server. Once we copy them
 * into `marketplace/public/cabinet/` (Week 2 of migration) we'll switch to
 * relative URLs to drop the cross-origin asset hop on install.
 */
export function GET() {
  const manifest = {
    name: "Кабинет мастера · Честные мастера",
    short_name: "Кабинет",
    description: "Кабинет мастера: заказы, баланс, чат с диспетчером.",
    start_url: "/cabinet/orders",
    scope: "/cabinet/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#0d9488",
    lang: "ru",
    icons: [
      {
        src: "/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    categories: ["productivity", "utilities"],
    id: "/cabinet/",
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
