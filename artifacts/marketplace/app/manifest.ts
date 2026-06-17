import type { MetadataRoute } from "next";

/**
 * PWA web app manifest for the master cabinet.
 *
 * Scoped to `/cabinet/*` so installing the app from a public marketplace page
 * still lands the master in their workspace, and so service-worker push
 * notification clicks open inside the installed app surface (when present).
 *
 * Icons are simple brand SVGs — Android / Chrome accept SVG sources for
 * `any maskable`, iOS uses the `apple-touch-icon` link in `app/layout.tsx`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Честные мастера — Кабинет",
    short_name: "Кабинет",
    description: "Заявки, чат с диспетчером, кейсы и баланс — в одном месте.",
    start_url: "/cabinet/dashboard",
    scope: "/cabinet/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAF6F0",
    theme_color: "#1F1D1A",
    lang: "ru",
    icons: [
      {
        src: "/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable",
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
    categories: ["business", "productivity"],
  };
}
