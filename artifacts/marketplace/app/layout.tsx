import type { Metadata } from "next";
import "./globals.css";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { publicUrl } from "../lib/env";

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(publicUrl()),
    title: { default: "Честные мастера", template: "%s · Честные мастера" },
    description: "Подбор проверенных мастеров для ремонта и быта в вашем городе",
    icons: { icon: "/favicon.ico" },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
