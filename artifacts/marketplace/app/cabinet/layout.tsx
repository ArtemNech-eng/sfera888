import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import { getCurrentMaster } from "@/lib/cabinetAuth";
import { CabinetNav } from "./_components/CabinetNav";
import { CabinetTopbar } from "./_components/CabinetTopbar";
import { SuspendedScreen } from "./_components/SuspendedScreen";
import { CabinetSwInit } from "./_components/CabinetSwInit";
import { CabinetInstallBanner } from "./_components/CabinetInstallBanner";

/**
 * Auth-guarded layout for `/cabinet/*`. Resolves the master from the
 * shared session cookie; on miss redirects to `/login` preserving the
 * intended path so the user lands back where they started.
 *
 * Cabinet pages are the master's private workspace — never indexed.
 */
export const metadata: Metadata = {
  title: { default: "Кабинет мастера", template: "%s · Кабинет мастера" },
  robots: { index: false, follow: false },
  manifest: "/cabinet/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Кабинет",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Always SSR — depends on session cookie.
export const dynamic = "force-dynamic";

export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const master = await getCurrentMaster();
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/cabinet";

  if (!master) {
    // Forward original path so the user lands back where they came from.
    const next = encodeURIComponent(pathname);
    redirect(`/login?next=${next}`);
  }

  if (master.status === "suspended") {
    return <SuspendedScreen alias={master.alias} />;
  }

  // Redirect masters who haven't signed the contract yet.
  // Allow access to /cabinet/pending-contract itself so they can complete signing.
  if (!master.contractSignedAt && !pathname.startsWith("/cabinet/pending-contract")) {
    redirect("/cabinet/pending-contract");
  }

  // Chat is a full-bleed page (no max-width/padding card) so it feels like a
  // dedicated messenger screen rather than a panel embedded inside the cabinet.
  const isChat = pathname.startsWith("/cabinet/chat");

  return (
    <div className="cabinet-shell flex min-h-dvh flex-col bg-[var(--color-background,#f8fafc)]">
      <CabinetTopbar master={master} />

      {/* Body: sidebar on lg+, content fills */}
      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="hidden lg:block lg:w-60 lg:flex-shrink-0 lg:border-r lg:border-[var(--color-border)] lg:bg-white">
          <div className="sticky top-14 p-4">
            <CabinetNav variant="sidebar" />
          </div>
        </aside>

        <main className={isChat ? "min-w-0 flex-1" : "flex-1 pb-24 lg:pb-8"}>
          {isChat ? (
            children
          ) : (
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</div>
          )}
        </main>
      </div>

      {/* Bottom nav on mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-white shadow-lg lg:hidden">
        <CabinetNav variant="bottom" />
      </nav>

      {/* Toast notifications used by cabinet client components. Mounted once
          at the layout level so individual pages just import `toast` from
          `sonner` and call it. */}
      <Toaster position="top-center" richColors closeButton />

      {/* PWA: register service worker silently on first load */}
      <CabinetSwInit />

      {/* PWA: install banner — Android native prompt or iOS manual guide */}
      <CabinetInstallBanner />
    </div>
  );
}
