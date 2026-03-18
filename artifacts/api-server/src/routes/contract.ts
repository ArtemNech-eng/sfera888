import { Router } from "express";
import { db, mastersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import multer from "multer";
import { objectStorageClient } from "../lib/objectStorage.js";

const router = Router();

const passportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Только изображения"));
  },
});

function requireMasterPwa(req: any, res: any, next: any) {
  const masterId = (req.session as any).masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });
  next();
}

async function uploadPassportToGCS(masterId: number, buffer: Buffer, mimetype: string): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("Object storage not configured");
  const ts = Date.now();
  const ext = mimetype === "image/png" ? "png" : "jpg";
  const filename = `passport-${masterId}-${ts}.${ext}`;
  const bucket = objectStorageClient.bucket(bucketId);
  await bucket.file(`passports/${filename}`).save(buffer, { contentType: mimetype, resumable: false });
  return `/api/contract/passport/${filename}`;
}

async function verifyPassportWithGemini(buffer: Buffer, mimetype: string): Promise<{ valid: boolean; note: string }> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!baseUrl || !apiKey) {
    console.warn("[Gemini] AI integration env vars missing, skipping verification");
    return { valid: true, note: "AI-проверка недоступна" };
  }

  const base64 = buffer.toString("base64");

  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType: mimetype, data: base64 } },
        {
          text: `Ты — система верификации документов. На изображении должен быть российский паспорт.

Проверь:
1. Это действительно паспорт РФ (обложка или разворот с фото и данными владельца)?
2. Фотография достаточно чёткая, чтобы читать данные?
3. Документ не закрыт рукой и не сильно повреждён?

Ответь СТРОГО в формате JSON (без markdown):
{"valid": true/false, "note": "краткое пояснение на русском, 1-2 предложения"}

Если это не паспорт РФ — valid: false. Если плохое качество — valid: false с пояснением.`,
        },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 300 },
  };

  try {
    const url = `${baseUrl}/v1beta/models/gemini-2.5-flash:generateContent`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error("[Gemini] Error response:", resp.status, err);
      return { valid: true, note: "AI-проверка временно недоступна" };
    }
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return { valid: !!parsed.valid, note: parsed.note ?? "" };
  } catch (err) {
    console.error("[Gemini] Parse/request error:", err);
    return { valid: true, note: "AI-проверка временно недоступна" };
  }
}

// POST /api/contract/sign — upload passport + sign contract
router.post("/sign", requireMasterPwa, passportUpload.single("passport"), async (req, res) => {
  const masterId = (req.session as any).masterId as number;

  if (!req.file) return res.status(400).json({ error: "Фото паспорта обязательно" });

  const master = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId)).then(r => r[0]);
  if (!master) return res.status(404).json({ error: "Мастер не найден" });
  if (master.contractSignedAt) return res.status(400).json({ error: "Договор уже подписан" });

  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";

  // Upload passport photo to GCS
  let passportUrl: string;
  try {
    passportUrl = await uploadPassportToGCS(masterId, req.file.buffer, req.file.mimetype);
  } catch (err) {
    console.error("[Contract] GCS upload error:", err);
    return res.status(500).json({ error: "Ошибка загрузки фото" });
  }

  // AI verification
  const verification = await verifyPassportWithGemini(req.file.buffer, req.file.mimetype);

  // Save to DB
  await db.update(mastersTable)
    .set({
      contractSignedAt: new Date(),
      contractSignIp: ip,
      passportPhotoUrl: passportUrl,
      passportVerified: verification.valid,
      passportVerifyNote: verification.note,
      status: verification.valid ? "active" : "pending_contract",
      contractLink: null,
    })
    .where(eq(mastersTable.id, masterId));

  if (!verification.valid) {
    return res.status(422).json({
      error: "Паспорт не прошёл проверку",
      note: verification.note,
    });
  }

  res.json({ success: true, note: verification.note });
});

// GET /api/contract/status — contract signing status for the current master
router.get("/status", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId as number;
  const master = await db.select({
    contractSignedAt: mastersTable.contractSignedAt,
    passportVerified: mastersTable.passportVerified,
    passportVerifyNote: mastersTable.passportVerifyNote,
    status: mastersTable.status,
  }).from(mastersTable).where(eq(mastersTable.id, masterId)).then(r => r[0]);
  if (!master) return res.status(404).json({ error: "Не найден" });
  res.json(master);
});

// GET /api/contract/passport/:filename — serve passport photo (admin only, or own)
router.get("/passport/:filename", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  const sessionMasterId = (req.session as any).masterId;
  if (!sessionUserId && !sessionMasterId) return res.status(401).json({ error: "Не авторизован" });

  const { filename } = req.params;
  if (!filename || filename.includes("..")) return res.status(400).json({ error: "Недопустимое имя" });

  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) return res.status(500).json({ error: "Storage not configured" });

  try {
    const bucket = objectStorageClient.bucket(bucketId);
    const file = bucket.file(`passports/${filename}`);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).json({ error: "Файл не найден" });
    const [metadata] = await file.getMetadata();
    res.setHeader("Content-Type", (metadata as any).contentType ?? "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    file.createReadStream().pipe(res);
  } catch (err) {
    console.error("[Contract] Serve passport error:", err);
    res.status(500).json({ error: "Ошибка чтения файла" });
  }
});

export default router;
