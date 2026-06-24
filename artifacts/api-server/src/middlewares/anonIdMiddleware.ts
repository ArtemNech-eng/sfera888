import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

const COOKIE_NAME = "kiro_anon_id";
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      anonId?: string;
    }
  }
}

/**
 * Reads `kiro_anon_id` cookie, validates it as UUID v4-shaped string,
 * and on missing/invalid value generates a fresh UUID and writes it back
 * via Set-Cookie. Always populates `req.anonId` for downstream handlers.
 *
 * Must be registered after `cookieParser()` so `req.cookies` is populated.
 *
 * Implements requirements 4.1 and 4.2 of the AI_Design_Product spec.
 */
export function anonIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const fromCookie = req.cookies?.[COOKIE_NAME];
  if (typeof fromCookie === "string" && UUID_RE.test(fromCookie)) {
    req.anonId = fromCookie;
    return next();
  }

  const fresh = randomUUID();
  res.cookie(COOKIE_NAME, fresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
  req.anonId = fresh;
  next();
}
