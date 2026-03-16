import { Router, type Request, type Response } from "express";

const router = Router();

/**
 * GET /tg-file/*filePath
 *
 * Proxies Telegram Bot API file downloads using the current BOT_TOKEN from env.
 * This avoids embedding the token in stored URLs, so photos survive token rotation.
 *
 * Usage: store "/api/tg-file/photos/file_2.jpg" in DB instead of the full Telegram URL.
 */
router.get("/*filePath", async (req: Request, res: Response) => {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    res.status(503).json({ error: "Bot token not configured" });
    return;
  }

  const filePath = (req.params as any).filePath as string;
  if (!filePath) {
    res.status(400).json({ error: "Missing file path" });
    return;
  }

  const telegramUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

  try {
    const upstream = await fetch(telegramUrl);

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: "File not found on Telegram" });
      return;
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");

    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch {
    res.status(502).json({ error: "Failed to fetch file from Telegram" });
  }
});

export default router;
