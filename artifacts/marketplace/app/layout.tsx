import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { YandexMetrika } from "../components/YandexMetrika";
import { publicUrl } from "../lib/env";

// Manrope is the brand sans-serif. Loaded via `next/font/google` so it ships
// with `font-display: swap` and Next handles the CSS-variable wiring.
// `globals.css` aliases `--font-manrope` to `--font-sans` so utility classes
// (`font-sans`, `font-medium`, etc.) keep resolving.
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// Theme color drives the iOS / Chrome status-bar tint when the cabinet is
// installed as a PWA. Matches the brand teal used in `app/icon.svg` and the
// manifest `theme_color`.
export const viewport = {
  themeColor: "#0F766E",
};

/**
 * Routes that own their own chrome (cabinet shell, login form). The root
 * layout still wraps them with `<html>`/`<body>` so global CSS, fonts and
 * analytics keep working, but we skip the public Header/Footer to avoid
 * double navigation. Pathname comes from `middleware.ts`, which injects an
 * `x-pathname` header on every request.
 */
function isOwnChromeRoute(pathname: string): boolean {
  return pathname.startsWith("/cabinet") || pathname === "/login" || pathname.startsWith("/login/");
}

export function generateMetadata(): Metadata {
  const url = publicUrl();
  const description =
    "Подбор проверенных мастеров для ремонта и быта в вашем городе";
  return {
    metadataBase: new URL(url),
    title: { default: "Честные мастера", template: "%s · Честные мастера" },
    description,
    // `app/icon.svg` is picked up by Next.js automatically. Apple ignores PWA
    // manifest icons for the home-screen install on iOS, so we still expose
    // a dedicated `apple-touch-icon` (SVG path served from `public/`).
    icons: {
      apple: "/apple-touch-icon.svg",
    },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: "Честные мастера",
      title: "Честные мастера",
      description,
      url,
      images: [
        {
          url: "/og-default.svg",
          width: 1200,
          height: 630,
          alt: "Честные мастера — проверенные мастера для ремонта",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Честные мастера",
      description,
      images: ["/og-default.svg"],
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/";
  const ownChrome = isOwnChromeRoute(pathname);

  return (
    <html lang="ru" className={manrope.variable}>
      <body>
        {ownChrome ? null : <Header />}
        <main className="flex-1">{children}</main>
        {ownChrome ? null : <Footer />}
        <YandexMetrika />
      </body>
    </html>
  );
}
