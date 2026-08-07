import type { Metadata } from "next";
import { Manrope, Lora } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { CookieBanner } from "../components/CookieBanner";
import { YandexMetrika } from "../components/YandexMetrika";
import { publicUrl } from "../lib/env";
import { fetchCommunityCities } from "../lib/communityApi";

// Manrope — body / UI / numerals / buttons.
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// Lora — display serif для H1 главных страниц (home / raboty / case).
// Variable font с поддержкой кириллицы — Fraunces (первый выбор) кириллицу
// не поддерживает, а Lora имеет тот же humanist-warm-magazine характер.
// `next/font/google` self-hosts шрифт и устраняет CLS.
const lora = Lora({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  weight: ["500", "600"],
  display: "swap",
});

// Theme color drives the iOS / Chrome status-bar tint when the cabinet is
// installed as a PWA. Zen city-service coral accent (matches --color-cta).
export const viewport = {
  themeColor: "#FF5A3C",
};

/**
 * Routes that own their own chrome (cabinet shell, login form, the Avito
 * quick-lead page). The root layout still wraps them with `<html>`/`<body>`
 * so global CSS, fonts and analytics keep working, but we skip the public
 * Header/Footer to avoid double navigation. Pathname comes from
 * `middleware.ts`, which injects an `x-pathname` header on every request.
 *
 * `/zayavka` is a paid-traffic landing: every extra nav link is an exit from
 * the form, so it deliberately renders without the marketplace chrome.
 */
function isOwnChromeRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/cabinet") ||
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/zayavka" ||
    pathname.startsWith("/zayavka/")
  );
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
  // Города сообщества для переключателя в шапке (server-to-server, кэш 5 мин;
  // при недоступности апстрима — пустой список, шапка деградирует к ссылке на хаб).
  const communityCities = ownChrome ? [] : await fetchCommunityCities();

  return (
    <html lang="ru" className={`${manrope.variable} ${lora.variable}`}>
      <body>
        {ownChrome ? null : <Header cities={communityCities} />}
        <main className="flex-1">{children}</main>
        {ownChrome ? null : <Footer />}
        <CookieBanner />
        <YandexMetrika />
      </body>
    </html>
  );
}
