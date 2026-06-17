import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware injects the request pathname into a custom header so that server
 * components (in particular `app/layout.tsx`) can read it via `headers()` and
 * conditionally render layout elements.
 *
 * We use this to hide the public Header/Footer on cabinet routes (/cabinet/*,
 * /login) without falling back to route-groups (which would force a large
 * file refactor) or client-side `usePathname` (which would convert layout to
 * a client component and disable SSR-time decisions).
 *
 * The header name matches the convention used by Vercel's example apps.
 */
export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // Skip static assets and Next internals — pathname only matters for pages.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|og-default.svg|cabinet-icon|.*\\..*).*)"],
};
