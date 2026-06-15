import type { Metadata } from "next";
import "./globals.css";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { YandexMetrika } from "../components/YandexMetrika";
import { publicUrl } from "../lib/env";

export function generateMetadata(): Metadata {
  const url = publicUrl();
  const description =
    "Подбор проверенных мастеров для ремонта и быта в вашем городе";
  return {
    metadataBase: new URL(url),
    title: { default: "Честные мастера", template: "%s · Честные мастера" },
    description,
    // `app/icon.svg` and `app/apple-icon.svg` are picked up automatically by
    // Next.js — no need to declare `icons` here. Removing the previous
    // hard-coded `/favicon.ico` reference (the file never existed).
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <YandexMetrika />
      </body>
    </html>
  );
}
