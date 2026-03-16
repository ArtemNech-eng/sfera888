import { Router, type Request, type Response } from "express";

const router = Router();

/**
 * GET /tg-file/:fileId
 *
 * Proxies Telegram Bot API file downloads by file_id.
 * - file_id is permanent (unlike file_path which expires)
 * - Calls getFile() at request time to get a fresh file_path, then streams the file
 * - Uses current TELEGRAM_BOT_TOKEN from env, so token rotation doesn't break URLs
 *
 * Store "/api/tg-file/<file_id>" in the DB.
 */
router.get("/:fileId", async (req: Request, res: Response) => {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    res.status(503).json({ error: "Bot token not configured" });
    return;
  }

  const { fileId } = req.params;
  if (!fileId) {
    res.status(400).json({ error: "Missing file id" });
    return;
  }

  try {
    // Step 1: resolve file_id → current file_path
    const getFileResp = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
    );
    const getFileData = (await getFileResp.json()) as { ok: boolean; result?: { file_path: string } };

    if (!getFileData.ok || !getFileData.result?.file_path) {
      res.status(404).json({ error: "File not found on Telegram" });
      return;
    }

    // Step 2: download the file
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${getFileData.result.file_path}`;
    const upstream = await fetch(fileUrl);

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: "Failed to download file from Telegram" });
      return;
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    res.setHeader("Content-Type", contentType);
    // Cache for 1 hour (file_path is valid for ~1 hour anyway)
    res.setHeader("Cache-Control", "public, max-age=3600");

    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch {
    res.status(502).json({ error: "Failed to fetch file from Telegram" });
  }
});

export default router;
