/**
 * Simple in-memory rate limiter for Express routes.
 * Suitable for single-instance deployments.
 * For multi-instance scaling, replace with Redis-backed limiter.
 */

type RateLimitStore = Map<string, { count: number; resetAt: number }>;

export interface RateLimitOptions {
  windowMs: number;   // e.g. 60_000 for 1 minute
  maxAttempts: number; // e.g. 5 attempts per window
  keyGenerator?: (req: any) => string;
}

function defaultKeyGenerator(req: any): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function createRateLimiter(options: RateLimitOptions) {
  const store: RateLimitStore = new Map();
  const { windowMs, maxAttempts, keyGenerator = defaultKeyGenerator } = options;

  return function rateLimitMiddleware(req: any, res: any, next: any) {
    const key = keyGenerator(req);
    const now = Date.now();

    const record = store.get(key);
    if (!record || now > record.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= maxAttempts) {
      return res.status(429).json({
        error: "too_many_requests",
        message: `Слишком много попыток. Попробуйте через ${Math.ceil((record.resetAt - now) / 1000)} сек.`,
      });
    }

    record.count += 1;
    return next();
  };
}
