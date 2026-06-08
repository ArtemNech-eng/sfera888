import { Router } from "express";
import { db, mastersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import multer from "multer";
import { Readable } from "stream";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router = Router();
const objectStorageService = new ObjectStorageService();

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

function bufferToDataUri(buffer: Buffer, mimetype: string): string {
  return `data:${mimetype};base64,${buffer.toString("base64")}`;
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
    const data = await resp.json() as any;
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

    // Store passport photos as base64 data URIs directly in DB
    const passportUrl = bufferToDataUri(passportFile.buffer, passportFile.mimetype);
    const passportRegUrl = bufferToDataUri(passportRegFile.buffer, passportRegFile.mimetype);

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

    // If AI rejected the passport, don't save — ask master to retry with better photos
    if (!allValid) {
      return res.status(422).json({
        error: "Паспорт не прошёл проверку",
        note: combinedNote,
        failedMain: !verifyMain.valid,
        failedReg: !verifyReg.valid,
      });
    }

    // AI passed — save but keep pending_contract: admin must manually confirm before master gets orders
    await db.update(mastersTable)
      .set({
        contractSignedAt: new Date(),
        contractSignIp: ip,
        passportPhotoUrl: passportUrl,
        passportRegPhotoUrl: passportRegUrl,
        passportVerified: false,       // admin confirms via CRM
        passportVerifyNote: combinedNote || "AI: паспорт прошёл проверку. Ожидает подтверждения администратора.",
        contractFullName: fullName.trim(),
        contractPassportNumber: passportNumber.trim(),
        contractPassportDate: passportDate.trim(),
        contractPassportIssuer: passportIssuer.trim(),
        contractAddress: address.trim(),
        status: "pending_contract",    // always wait for admin
        contractLink: null,
      })
      .where(eq(mastersTable.id, masterId));

    res.json({ success: true, note: combinedNote, pendingAdminConfirmation: true });
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

// GET /api/contract/view/:masterId — HTML printable contract view (admin only)
router.get("/view/:masterId", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) return res.status(401).send("Не авторизован");

  const masterId = parseInt(String(req.params.masterId));
  if (isNaN(masterId)) return res.status(400).send("Некорректный ID");

  const master = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId)).then(r => r[0]);
  if (!master) return res.status(404).send("Мастер не найден");
  if (!master.contractSignedAt) return res.status(404).send("Договор не подписан");

  const contractNum = String(masterId).padStart(3, "0");
  const signedAt = master.contractSignedAt ? new Date(master.contractSignedAt) : new Date();
  const months = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  const dateStr = `${signedAt.getDate()} ${months[signedAt.getMonth()]} ${signedAt.getFullYear()} г.`;

  const fn = (v: string | null | undefined, fallback = "—") => v?.trim() || fallback;

  const passportImgTags = [
    master.passportPhotoUrl ? `<div class="photo-block"><p class="photo-label">Разворот с фото</p><img src="${master.passportPhotoUrl}" alt="Паспорт (разворот)"/></div>` : "",
    master.passportRegPhotoUrl ? `<div class="photo-block"><p class="photo-label">Страница прописки</p><img src="${master.passportRegPhotoUrl}" alt="Паспорт (прописка)"/></div>` : "",
  ].filter(Boolean).join("\n");

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<title>Договор № ${contractNum} — информационные услуги</title>
<style>
  body { font-family: "Times New Roman", serif; font-size: 12pt; max-width: 800px; margin: 40px auto; color: #111; line-height: 1.55; }
  h1 { font-size: 14pt; text-align: center; margin-bottom: 4px; }
  h2 { font-size: 12pt; margin-top: 20px; margin-bottom: 6px; }
  .meta { text-align: center; color: #555; margin-bottom: 24px; font-size: 11pt; }
  .section { margin-bottom: 14px; }
  .divider { border: none; border-top: 1px solid #bbb; margin: 18px 0; }
  .info-table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .info-table td { padding: 4px 8px; font-size: 11pt; }
  .info-table td:first-child { font-weight: bold; color: #555; width: 180px; }
  .verdict { padding: 8px 14px; border-radius: 6px; display: inline-block; margin: 8px 0; font-size: 11pt; }
  .verdict.ok { background: #d1fae5; color: #065f46; }
  .verdict.fail { background: #fef3c7; color: #92400e; }
  .sign-block { background: #f8f8f8; border: 1px solid #ddd; border-radius: 8px; padding: 14px 18px; margin: 18px 0; font-size: 11pt; }
  .photos { display: flex; gap: 20px; flex-wrap: wrap; margin: 18px 0; }
  .photo-block { text-align: center; }
  .photo-block img { max-width: 340px; max-height: 260px; border: 1px solid #ddd; border-radius: 6px; }
  .photo-label { font-size: 10pt; color: #555; margin-bottom: 4px; }
  .contract-text { white-space: pre-wrap; font-size: 11pt; line-height: 1.6; background: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 16px 20px; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>ДОГОВОР № ${contractNum}</h1>
<div class="meta">г. Краснодар &nbsp;·&nbsp; ${dateStr} &nbsp;·&nbsp; Договор об оказании информационных услуг и предоставлении доступа к заявкам клиентов</div>

<div class="verdict ${master.passportVerified ? "ok" : "fail"}">
  ${master.passportVerified ? "✅ Паспорт проверен" : "⚠️ Паспорт требует проверки"}
  ${master.passportVerifyNote ? ` — ${master.passportVerifyNote}` : ""}
</div>

<h2>Реквизиты мастера</h2>
<table class="info-table">
  <tr><td>ФИО</td><td>${fn(master.contractFullName)}</td></tr>
  <tr><td>Паспорт</td><td>${fn(master.contractPassportNumber)}</td></tr>
  <tr><td>Выдан</td><td>${fn(master.contractPassportDate)}${master.contractPassportIssuer ? ", " + master.contractPassportIssuer : ""}</td></tr>
  <tr><td>Адрес</td><td>${fn(master.contractAddress)}</td></tr>
  <tr><td>Телефон</td><td>${fn(master.phone)}</td></tr>
</table>

<div class="sign-block">
  <strong>Подписан:</strong> ${signedAt.toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
  ${master.contractSignIp ? `&nbsp;·&nbsp; <span style="color:#888">IP: ${master.contractSignIp}</span>` : ""}
</div>

${passportImgTags ? `<h2>Фото документов</h2><div class="photos">${passportImgTags}</div>` : ""}

<hr class="divider"/>
<h2>Текст договора</h2>
<div class="contract-text">ДОГОВОР № ${contractNum}  г. Краснодар  ${dateStr}
Договор об оказании информационных услуг и предоставлении доступа к заявкам клиентов

ИП Коваленко Игорь Геннадьевич, действующий на основании государственной регистрации (далее — «Исполнитель» или «Платформа»), с одной стороны, и гражданин(ка) ${fn(master.contractFullName)}, ${fn(master.contractPassportNumber)}, ${fn(master.contractPassportDate)} ${fn(master.contractPassportIssuer)}, проживающий(ая) по адресу: ${fn(master.contractAddress)}, ${fn(master.phone)}, (далее — «Мастер»), с другой стороны, совместно — «Стороны», заключили настоящий договор о нижеследующем.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ПРЕДМЕТ ДОГОВОРА

1.1. Исполнитель предоставляет Мастеру доступ к заявкам клиентов через автоматизированную информационную систему Платформы. Заявки размещаются клиентами добровольно и самостоятельно.

1.2. Платформа не является стороной сделки между Мастером и Клиентом. Платформа не гарантирует объём заказов, доход Мастера и результат работ. Мастер самостоятельно несёт ответственность перед Клиентом за качество работ.

1.3. Мастер получает доступ к контактным данным Клиента (имя, телефон, адрес, описание работ) только после оплаты токенами в порядке, установленном настоящим договором.

1.4. Персональные данные клиентов становятся доступны Мастеру после оплаты токенами. Мастер самостоятельно несёт ответственность за обработку полученных персональных данных в соответствии с Федеральным законом № 152-ФЗ «О персональных данных».

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. ТОКЕНЫ И ПОРЯДОК ОПЛАТЫ

2.1. Внутренняя валюта Платформы — токены. Токены не являются денежным знаком, не подлежат обмену на наличные деньги и не передаются третьим лицам.

2.2. Мастер приобретает токены через личный кабинет или у менеджера Платформы. Пополнение баланса происходит за безналичный расчёт.

2.3. За доступ к заявке (получение контактных данных клиента) с баланса Мастера списывается стоимость в токенах. Стоимость заявки определяется автоматизированной системой на основании вида работ, города, района, времени суток, загруженности и других факторов.

2.4. Минимальная стоимость заявки составляет 2 (два) токена. Актуальная стоимость токена, а также стоимость конкретной заявки уточняются на сайте Платформы или у менеджера.

2.5. Мастер не платит комиссию или вознаграждение после выполнения работ. Все расчёты между Мастером и Платформой производятся исключительно в токеновой системе до момента получения контактных данных.

2.6. Клиент оплачивает выполненные работы напрямую Мастеру. Платформа не участвует в расчётах между Клиентом и Мастером.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. ТЕСТОВЫЙ ПЕРИОД И КРЕДИТНЫЙ ЛИМИТ

3.1. Новым Мастерам Платформа может предоставить тестовый период: доступ к ограниченному количеству заявок без предварительной оплаты или с отрицательным балансом в пределах установленного кредитного лимита.

3.2. Размер тестового периода и кредитного лимита устанавливается Платформой индивидуально и может быть изменён в одностороннем порядке.

3.3. По исчерпании тестового периода или кредитного лимита доступ к новым заявкам автоматически блокируется до пополнения баланса токенами.

3.4. Использование кредитного лимита не освобождает Мастера от обязанности погасить образовавшуюся задолженность в токенах.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. БЛОКИРОВКА ДОСТУПА

4.1. При отрицательном балансе токенов (превышении кредитного лимита) система автоматически ограничивает Мастеру доступ к новым заявкам.

4.2. Платформа вправе приостановить доступ к заявкам в случае:
- систематического отказа от принятых заявок без уведомления;
- нарушения правил работы на объекте (в том числе употребление алкоголя);
- жалоб клиентов на качество работ;
- непогашения задолженности по токенам в течение 3 календарных дней.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. ПЕРСОНАЛЬНЫЕ ДАННЫЕ

5.1. Мастер предоставляет Платформе копию паспорта (главный разворот и страницу с пропиской) и контактные данные для идентификации и заключения договора.

5.2. Мастер даёт согласие Платформе на обработку своих персональных данных в объёме, необходимом для исполнения настоящего договора.

5.3. Платформа не передаёт и не распространяет персональные данные клиентов третьим лицам. Клиенты самостоятельно размещают заявки с указанием своих данных. Мастер получает доступ к этой информации только после оплаты токенами.

5.4. Мастер обязуется не использовать персональные данные клиентов в целях, не связанных с исполнением заявки, и не передавать их третьим лицам.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6. ОТВЕТСТВЕННОСТЬ СТОРОН

6.1. Платформа не несёт ответственности за качество работ Мастера, срыв сроков, претензии Клиентов и иные последствия, возникшие при исполнении заявки.

6.2. Мастер несёт полную материальную и юридическую ответственность перед Клиентом за выполненные работы.

6.3. За нарушение условий настоящего договора Платформа вправе расторгнуть договор в одностороннем порядке.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

7. УРЕГУЛИРОВАНИЕ СПОРОВ

7.1. Споры решаются путём переговоров. Претензионный порядок — 10 календарных дней.

7.2. При недостижении соглашения — суд по месту нахождения Исполнителя (г. Краснодар).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

8. ФОРС-МАЖОР

8.1. Стороны освобождаются от ответственности за неисполнение обязательств вследствие обстоятельств непреодолимой силы.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

9. СРОК ДЕЙСТВИЯ И РАСТОРЖЕНИЕ

9.1. Договор вступает в силу с момента электронного акцепта (подписание в PWA / скрин согласия) и действует до полного исполнения обязательств.

9.2. Любая из Сторон вправе расторгнуть договор письменно с уведомлением за 7 календарных дней.

9.3. При расторжении Мастер обязан погасить задолженность по токенам в полном объёме.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

10. ПРОЧИЕ УСЛОВИЯ

10.1. Мастер обязуется не привлекать Клиентов, полученных через Платформу, напрямую в обход Платформы в течение 12 месяцев после последнего контакта.

10.2. Мастер обязуется не употреблять алкогольные напитки и иные одурманивающие вещества на объекте Клиента. Нарушение — основание для немедленного расторжения.

10.3. Мастер обязуется соблюдать правила работы на объекте: приезжать вовремя, при опоздании предупреждать за 2 часа, работать аккуратно, убирать за собой.

10.4. Платформа вправе вносить изменения в условия предоставления доступа к заявкам (в том числе стоимость в токенах) путём публикации новых условий на сайте. Продолжение использования Платформы означает согласие с изменениями.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Мастер: ${fn(master.contractFullName)}
Подписано электронно: ${signedAt.toLocaleString("ru-RU")}, IP: ${fn(master.contractSignIp)}

Исполнитель: ИП Коваленко Игорь Геннадьевич
ОГРНИП / ИНН: указываются при необходимости
</div>

</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// GET /api/contract/obj/objects/* — serve uploaded passport photos (via Replit Object Storage)
router.get("/obj/objects/*path", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  const sessionMasterId = (req.session as any).masterId;
  if (!sessionUserId && !sessionMasterId) return res.status(401).json({ error: "Не авторизован" });

  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile, 3600);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error("[Contract] Serve obj error:", err);
    res.status(500).json({ error: "Ошибка чтения файла" });
  }
});

// GET /api/contract/passport/:filename — legacy serve (old GCS uploads, kept for backward compat)
router.get("/passport/:filename", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  const sessionMasterId = (req.session as any).masterId;
  if (!sessionUserId && !sessionMasterId) return res.status(401).json({ error: "Не авторизован" });
  return res.status(404).json({ error: "Файл не найден (устаревший формат)" });
});

export default router;
