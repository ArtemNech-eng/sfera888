/**
 * Reverse proxy: forwards /cabinet/*, /api/cabinet/*, /api/cabinet-extra/*
 * from sfera-master.ru to the marketplace (chestnye-mastera.ru).
 *
 * Why this is clean:
 *   • assetPrefix in marketplace Next.js makes JS/CSS load directly from
 *     chestnye-mastera.ru — only HTML pages + RSC payloads go through this proxy.
 *   • Session cookie (connect.sid) is already on sfera-master.ru — no domain
 *     changes, no re-login required.
 *   • Double-hop for /api/cabinet calls adds ~5 ms on Railway internal network.
 *
 * Enabled via env CABINET_PROXY=1 on the api-server Railway service.
 * MARKETPLACE_PUBLIC_URL must point to the marketplace origin.
 */

import type { Request, Response } from "express";
import https from "https";
import http from "http";

/** Headers that must not be forwarded (hop-by-hop per RFC 7230 §6.1). */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

export function createCabinetProxy(marketplaceOrigin: string) {
  const target = new URL(marketplaceOrigin.replace(/\/+$/, ""));
  const useHttps = target.protocol === "https:";
  const mod = useHttps ? https : http;
  const port = target.port ? Number(target.port) : useHttps ? 443 : 80;

  return function cabinetProxyMiddleware(req: Request, res: Response): void {
    // Full upstream path including query string
    const upstreamPath = req.originalUrl; // e.g. /cabinet/orders?_rsc=abc

    // Build forwarded headers — strip hop-by-hop, override host
    const fwd: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase()) && v !== undefined) {
        fwd[k] = v as string | string[];
      }
    }
    fwd["host"] = target.hostname;
    fwd["x-forwarded-host"] = String(req.headers["x-forwarded-host"] ?? req.hostname);
    fwd["x-forwarded-proto"] = "https";
    // x-pathname is needed by the cabinet layout for redirect logic.
    // marketplace middleware.ts sets it too, but setting it here is a safe belt-and-suspenders.
    fwd["x-pathname"] = req.path;

    const proxyReq = mod.request(
      { hostname: target.hostname, port, path: upstreamPath, method: req.method, headers: fwd },
      (proxyRes) => {
        // Rewrite /login redirects → /master-pwa/login.
        // When the master is not authenticated, marketplace redirects to /login.
        // We intercept and send them to the familiar master-pwa login page instead.
        // After they log in there, the session is set on sfera-master.ru and
        // subsequent cabinet requests are authenticated.
        const location = proxyRes.headers["location"];
        if (typeof location === "string" && /^\/login(\?|$)/.test(location)) {
          const rewritten = location.replace(/^\/login/, "/master-pwa/login");
          res.redirect(302, rewritten);
          // Consume upstream response body to free the socket.
          proxyRes.resume();
          return;
        }

        // Pass response status + headers
        res.status(proxyRes.statusCode ?? 200);
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (!HOP_BY_HOP.has(k.toLowerCase()) && v !== undefined) {
            res.setHeader(k, v as string | string[]);
          }
        }
        // Stream body — no buffering
        proxyRes.pipe(res, { end: true });
      },
    );

    proxyReq.on("error", (err) => {
      console.error("[cabinet-proxy] upstream error:", err.message);
      if (!res.headersSent) res.status(502).send("Кабинет временно недоступен");
    });

    // Forward request body.
    // IMPORTANT: express.json() and express.urlencoded() run before this
    // middleware and consume the raw stream — req.body holds the parsed result.
    // For those content-types we re-serialize; for everything else (multipart,
    // binary) the stream is untouched and we pipe it directly.
    if (req.method !== "GET" && req.method !== "HEAD") {
      const ct = String(req.headers["content-type"] ?? "").toLowerCase();
      const wasParserRun =
        req.body !== undefined &&
        (ct.includes("application/json") ||
          ct.includes("application/x-www-form-urlencoded"));

      if (wasParserRun) {
        // Re-serialize the already-parsed body and fix content-length.
        const raw = Buffer.from(
          ct.includes("json")
            ? JSON.stringify(req.body)
            : new URLSearchParams(req.body as Record<string, string>).toString(),
          "utf8",
        );
        proxyReq.setHeader("content-length", raw.length);
        proxyReq.end(raw);
      } else {
        // Multipart / binary — stream not yet consumed, pipe directly.
        req.pipe(proxyReq, { end: true });
      }
    } else {
      proxyReq.end();
    }
  };
}
