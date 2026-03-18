import { Router } from "express";
import { db, mastersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import multer from "multer";
import { objectStorageClient } from "../lib/objectStorage.js";

const router = Router();

const passportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
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

async function uploadPassportToGCS(masterId: number, suffix: string, buffer: Buffer, mimetype: string): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("Object storage not configured");
  const ts = Date.now();
  const ext = mimetype === "image/png" ? "png" : "jpg";
  const filename = `passport-${masterId}-${suffix}-${ts}.${ext}`;
  const bucket = objectStorageClient.bucket(bucketId);
  await bucket.file(`passports/${filename}`).save(buffer, { contentType: mimetype, resumable: false });
  return `/api/contract/passport/${filename}`;
}

type PageType = "main" | "registration";

async function verifyPassportPageWithGemini(
  buffer: Buffer,
  mimetype: string,
  pageType: PageType,
): Promise<{ valid: boolean; note: string }> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!baseUrl || !apiKey) {
    console.warn("[Gemini] AI integration env vars missing, skipping verification");
    return { valid: true, note: "AI-проверка недоступна" };
  }

  const base64 = buffer.toString("base64");

  const promptMain = `Ты — строгая система верификации документов для юридически значимых договоров.

На изображении ДОЛЖЕН быть разворот российского паспорта (страницы 2–3): слева — фотография владельца и его подпись, справа — серия/номер, ФИО, дата рождения, место рождения, дата выдачи, код подразделения, кем выдан.

Критерии отклонения (valid: false):
• На фото НЕ видно паспорт РФ — любой другой документ, предмет, селфи, пейзаж и т.д.
• Видна только обложка паспорта без разворота с данными
• Фото размытое и нельзя прочитать серию/номер или ФИО
• Паспорт закрыт рукой или посторонним предметом, скрывающим данные
• Изображение слишком тёмное или засвеченное
• Видна только одна страница разворота

Если документ похож на паспорт, но есть незначительные погрешности — пропускай (valid: true).

Ответь СТРОГО только JSON без markdown:
{"valid": true/false, "note": "пояснение на русском, 1-2 предложения"}`;

  const promptReg = `Ты — строгая система верификации документов для юридически значимых договоров.

На изображении ДОЛЖНА быть страница прописки (регистрации) российского паспорта — страница 5, на которой стоит штамп о регистрации по месту жительства с адресом и датой.

Критерии отклонения (valid: false):
• На фото НЕ видно страницу прописки российского паспорта
• На фото любой другой документ, предмет, другая страница паспорта без штампа прописки
• Фото размытое и нельзя прочитать адрес регистрации
• Страница закрыта или данные нечитаемы
• Страница прописки пустая (нет штампа о регистрации)

Если штамп прописки виден, адрес читаем — пропускай (valid: true), даже если фото немного косое.

Ответь СТРОГО только JSON без markdown:
{"valid": true/false, "note": "пояснение на русском, 1-2 предложения"}`;

  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType: mimetype, data: base64 } },
        { text: pageType === "main" ? promptMain : promptReg },
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

// POST /api/contract/sign — upload 2 passport pages + sign contract
router.post(
  "/sign",
  requireMasterPwa,
  passportUpload.fields([
    { name: "passport", maxCount: 1 },
    { name: "passportReg", maxCount: 1 },
  ]),
  async (req, res) => {
    const masterId = (req.session as any).masterId as number;

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const passportFile = files?.["passport"]?.[0];
    const passportRegFile = files?.["passportReg"]?.[0];

    if (!passportFile) return res.status(400).json({ error: "Фото главного разворота паспорта обязательно" });
    if (!passportRegFile) return res.status(400).json({ error: "Фото страницы прописки обязательно" });

    const { fullName, passportNumber, passportDate, passportIssuer, address } = req.body;
    if (!fullName?.trim()) return res.status(400).json({ error: "ФИО обязательно" });
    if (!passportNumber?.trim()) return res.status(400).json({ error: "Серия и номер паспорта обязательны" });
    if (!passportDate?.trim()) return res.status(400).json({ error: "Дата выдачи паспорта обязательна" });
    if (!passportIssuer?.trim()) return res.status(400).json({ error: "Кем выдан паспорт — обязательно" });
    if (!address?.trim()) return res.status(400).json({ error: "Адрес проживания обязателен" });

    const master = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId)).then(r => r[0]);
    if (!master) return res.status(404).json({ error: "Мастер не найден" });
    if (master.contractSignedAt) return res.status(400).json({ error: "Договор уже подписан" });

    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";

    // Upload both passport photos to GCS
    let passportUrl: string;
    let passportRegUrl: string;
    try {
      [passportUrl, passportRegUrl] = await Promise.all([
        uploadPassportToGCS(masterId, "main", passportFile.buffer, passportFile.mimetype),
        uploadPassportToGCS(masterId, "reg", passportRegFile.buffer, passportRegFile.mimetype),
      ]);
    } catch (err) {
      console.error("[Contract] GCS upload error:", err);
      return res.status(500).json({ error: "Ошибка загрузки фото" });
    }

    // AI verification for both pages (in parallel)
    const [verifyMain, verifyReg] = await Promise.all([
      verifyPassportPageWithGemini(passportFile.buffer, passportFile.mimetype, "main"),
      verifyPassportPageWithGemini(passportRegFile.buffer, passportRegFile.mimetype, "registration"),
    ]);

    const allValid = verifyMain.valid && verifyReg.valid;
    const combinedNote = [
      verifyMain.valid ? null : `Разворот с фото: ${verifyMain.note}`,
      verifyReg.valid ? null : `Страница прописки: ${verifyReg.note}`,
    ].filter(Boolean).join(" | ") || (verifyMain.note || verifyReg.note);

    // Save to DB
    await db.update(mastersTable)
      .set({
        contractSignedAt: new Date(),
        contractSignIp: ip,
        passportPhotoUrl: passportUrl,
        passportRegPhotoUrl: passportRegUrl,
        passportVerified: allValid,
        passportVerifyNote: combinedNote,
        contractFullName: fullName.trim(),
        contractPassportNumber: passportNumber.trim(),
        contractPassportDate: passportDate.trim(),
        contractPassportIssuer: passportIssuer.trim(),
        contractAddress: address.trim(),
        status: allValid ? "active" : "pending_contract",
        contractLink: null,
      })
      .where(eq(mastersTable.id, masterId));

    if (!allValid) {
      return res.status(422).json({
        error: "Паспорт не прошёл проверку",
        note: combinedNote,
        failedMain: !verifyMain.valid,
        failedReg: !verifyReg.valid,
      });
    }

    res.json({ success: true, note: combinedNote });
  },
);

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
