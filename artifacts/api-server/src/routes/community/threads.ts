/**
 * Community threads/comments HTTP-маршруты — форум-слой «тема → обсуждение».
 *
 * Монтируется под `/api/community/threads` (регистрация — routes/index.ts):
 *   • GET  /:id            — публичная тема + плоский список комментариев
 *     (уровень 1, публично; несуществующая/скрытая тема → 404).
 *   • POST /:id/comments   — публикация комментария (уровень доступа 3 —
 *     подтверждённый Community_Account по `X-Community-Account-Id`). Rate limit
 *     по IP. Тело `{ body, parentCommentId? }`.
 *
 * Доменная логика — в `src/lib/commentService.ts`; здесь только HTTP-слой,
 * уровень доступа и rate limit (тот же паттерн, что в community/geo.ts).
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { db, communityAccountsTable, type CommunityAccount } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getThreadById, listComments, createComment } from "../../lib/commentService.js";
import { hasPublishingRights } from "../../lib/communityAuth.js";
import { resolveAccountId } from "./geo.js";

declare const console: { error: (...args: unknown[]) => void };

const router = Router();

// ── Rate limiting по IP (защита POST от злоупотреблений) ─────────────────────
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;

function checkRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress;
  if (!ip) return next();
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  if (record && record.resetTime > now) {
    if (record.count >= RATE_LIMIT_MAX) {
      return res.status(429).json({ error: "Too many requests, please try again later." });
    }
    record.count += 1;
  } else {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
  }
  next();
}

interface CommunityRequest extends Request {
  communityAccount?: CommunityAccount;
}

/**
 * Уровень доступа 3: резолвит Community_Account и проверяет права публикации
 * (завершённая Phone_Verification). Нет id → 401; не подтверждён → 403.
 */
async function requireCommunityPublisher(
  req: CommunityRequest,
  res: Response,
  next: NextFunction,
) {
  const accountId = resolveAccountId(req);
  if (accountId === null) {
    return res.status(401).json({ error: "account_required" });
  }
  let account: CommunityAccount | undefined;
  try {
    [account] = await db
      .select()
      .from(communityAccountsTable)
      .where(eq(communityAccountsTable.id, accountId))
      .limit(1);
  } catch (err) {
    console.error("[community/threads] account lookup failed:", err);
    return res.status(500).json({ error: "internal_error" });
  }
  if (!hasPublishingRights(account)) {
    return res.status(403).json({ error: "verification_required" });
  }
  req.communityAccount = account;
  next();
}

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ── GET /:id — тема + комментарии (публично) ─────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(404).json({ notFound: true });
  try {
    const thread = await getThreadById(id);
    if (!thread) return res.status(404).json({ notFound: true });
    const comments = await listComments(id);
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    return res.json({ thread, comments });
  } catch (err) {
    console.error("[community/threads] GET failed:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /:id/comments — публикация комментария (уровень 3) ──────────────────
router.post(
  "/:id/comments",
  checkRateLimit,
  requireCommunityPublisher,
  async (req: CommunityRequest, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(404).json({ notFound: true });

    const body = (req.body ?? {}) as { body?: unknown; parentCommentId?: unknown };
    const text = typeof body.body === "string" ? body.body : "";
    const parentCommentId =
      body.parentCommentId == null ? null : parseId(body.parentCommentId);

    try {
      const result = await createComment({
        threadId: id,
        parentCommentId,
        authorAccountId: req.communityAccount!.id,
        body: text,
      });
      switch (result.status) {
        case "created":
          return res.status(201).json({ status: "created", comment: result.comment });
        case "rejected":
          return res
            .status(result.reason === "thread_not_found" ? 404 : 400)
            .json({ status: "rejected", reason: result.reason });
      }
    } catch (err) {
      console.error("[community/threads] POST comment failed:", err);
      return res.status(500).json({ error: "internal_error" });
    }
  },
);

export default router;
