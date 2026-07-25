import type { Metadata, Viewport } from "next";
import Link from "next/link";
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

  // Masters without a signed contract are NOT blocked from the cabinet. They can
  // browse the orders board and respond to leads exactly like the old master-pwa
  // cabinet allowed — the server tags such responses "Без договора" for the
  // operator (see api-server `POST /orders/:id/respond`) rather than rejecting
  // them. We only surface a non-blocking nudge banner (below) that links to the
  // signing wizard, so signing stays discoverable without gating lead responses.
  const needsContract =
    !master.contractSignedAt && !pathname.startsWith("/cabinet/pending-contract");

  // Chat is a full-bleed page (no max-width/padding card) so it feels like a
  // dedicated messenger screen rather than a panel embedded inside the cabinet.
  const isChat = pathname.startsWith("/cabinet/chat");

  return (
    <div
      className={`cabinet-shell flex flex-col bg-[var(--color-background,#f8fafc)] ${
        isChat ? "h-dvh overflow-hidden" : "min-h-dvh"
      }`}
    >
      <CabinetTopbar master={master} />

      {/* Non-blocking contract nudge for masters who haven't signed yet.
          Lets them keep working (respond to leads) while keeping the signing
          wizard one tap away. */}
      {needsContract && (
        <Link
          href="/cabinet/pending-contract"
          className="block border-b border-amber-200 bg-amber-50 transition-colors hover:bg-amber-100"
        >
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 sm:px-6">
            <span className="flex-1 text-xs text-amber-900 sm:text-sm">
              Откликаться на заявки можно уже сейчас. Подпишите договор, чтобы оператор мог назначить вам заказ.
            </span>
            <span className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white">
              Подписать договор
            </span>
          </div>
        </Link>
      )}

      {/* Body: sidebar on lg+, content fills */}
      <div className={`flex flex-1 flex-col lg:flex-row ${isChat ? "min-h-0" : ""}`}>
        <aside className="hidden lg:block lg:w-60 lg:flex-shrink-0 lg:border-r lg:border-[var(--color-border)] lg:bg-white">
          <div className="sticky top-14 p-4">
            <CabinetNav variant="sidebar" />
          </div>
        </aside>

        <main
          className={
            isChat
              ? "flex min-w-0 flex-1 min-h-0 pb-16 lg:pb-0"
              : "flex-1 pb-24 lg:pb-8"
          }
        >
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
