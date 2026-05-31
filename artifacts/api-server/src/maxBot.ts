import { isCircuitOpen, recordCircuitSuccess, recordCircuitFailure } from "./lib/broadcastUtils.js";

const MAX_API = "https://platform-api.max.ru";

function getToken(): string | undefined {
  return process.env.MAX_BOT_TOKEN;
}

// ─── Pending link confirmations (in-memory, 5 min TTL) ────────────────────────

interface PendingLink {
  masterId: number;
  masterName: string;
  expiry: number;
  override?: boolean; // true when replacing an existing maxChatId
}
const pendingLinks = new Map<number, PendingLink>();

function setPending(userId: number, masterId: number, masterName: string, override = false) {
  pendingLinks.set(userId, { masterId, masterName, expiry: Date.now() + 5 * 60_000, override });
}

function getPending(userId: number): PendingLink | null {
  const p = pendingLinks.get(userId);
  if (!p) return null;
  if (Date.now() > p.expiry) { pendingLinks.delete(userId); return null; }
  return p;
}

function clearPending(userId: number) {
  pendingLinks.delete(userId);
}

// Asks new (unlinked) user if they're already registered — first contact
async function sendNewUserGreeting(chatId: number): Promise<void> {
  await sendMaxWithButtonsToChat(
    chatId,
    `👋 Добро пожаловать в **Честный мастер**!\n\nВы уже зарегистрированы в нашем приложении?`,
    [[
      { text: "✅ Да, есть аккаунт", payload: "new:yes" },
      { text: "❌ Нет, впервые", payload: "new:no" },
    ]]
  );
}

// Sends the full onboarding pitch + app link for new masters
// userId is always user_id (from callback or message), NOT chat_id
async function sendOnboarding(userId: number): Promise<void> {
  // Message 1 — what we offer
  await sendMaxMessage(
    userId,
    `📌 **ЧТО МЫ ДАЁМ**\n\n` +
    `Стабильный поток заказов — 10-15 заявок в месяц на одного мастера.\n` +
    `Все клиенты частные, объекты разные — маленькие и большие.\n\n` +
    `________________________________\n\n` +
    `Работаем по токеновой модели:\n` +
    `• Каждый заказ оплачивается токенами (обычно 1–2 токена за заявку)\n` +
    `• Токены покупаются пакетами через приложение\n` +
    `• Чем больше пакет — тем меньше цена за токен\n\n` +
    `________________________________\n\n` +
    `Чтобы начать сотрудничать, нужно установить приложение и заполнить договор.`
  );
  // Message 2 — passport info
  await sendMaxMessage(
    userId,
    `При регистрации нужен будет паспорт. Паспорт — это стандартная процедура в сфере услуг: мы работаем с людьми и должны понимать, кого отправляем на объект.`
  );
  // Message 3 — app link + back button
  await sendMaxWithButtons(
    userId,
    `Вот ссылка на наше приложение:\nhttps://sfera-master.ru/master-pwa?max=${userId}`,
    [[{ text: "← Уже есть аккаунт", payload: "new:yes" }]]
  );
}

// Sends the app link for an already-registered master (login link)
async function sendLoginLink(chatId: number, alias: string): Promise<void> {
  await sendMaxMessageToChat(
    chatId,
    `👋 С возвращением, **${alias}**!\n\n📲 Войдите в приложение:\nhttps://sfera-master.ru/master-pwa\n\nЕсли забыли пароль — воспользуйтесь восстановлением на странице входа.`
  );
}

// ─── Logging ──────────────────────────────────────────────────────────────────

export async function logMaxEvent(
  masterId: number | null,
  maxUserId: string | number,
  event: string,
  note?: string
) {
  try {
    const { db, maxBotLogsTable } = await import("@workspace/db");
    await db.insert(maxBotLogsTable).values({
      masterId: masterId ?? null,
      maxUserId: String(maxUserId),
      event,
      note: note ?? null,
    });
  } catch (e) {
    console.error("[maxBot] logEvent error:", e);
  }
}

// ─── Bot info (cached) ────────────────────────────────────────────────────────

let _botLinkCache: string | null = null;

export async function getBotLink(): Promise<string | null> {
  if (_botLinkCache !== null) return _botLinkCache;
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${MAX_API}/me`, {
      headers: { Authorization: token },
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, any>;
    const username: string | null = data.username ?? data.link ?? null;
    if (username) _botLinkCache = username.startsWith("http") ? username : `https://max.ru/${username}`;
    return _botLinkCache;
  } catch {
    return null;
  }
}

// ─── Low-level send helper ────────────────────────────────────────────────────
// Max Bot API: recipient must be a query-param (?user_id= or ?chat_id=),
// the body carries only the message payload.

async function maxPost(
  recipientParam: "user_id" | "chat_id",
  recipientId: number,
  body: Record<string, unknown>
): Promise<void> {
  if (isCircuitOpen("max_api")) {
    console.warn(`[maxBot] circuit OPEN — skipping POST ${recipientParam}=${recipientId}`);
    return;
  }

  const token = getToken();
  if (!token) return;
  const url = `${MAX_API}/messages?${recipientParam}=${recipientId}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.text();
      console.error(`[maxBot] POST ${recipientParam}=${recipientId} failed:`, res.status, err);
      recordCircuitFailure("max_api");
    } else {
      console.log(`[maxBot] message sent OK to ${recipientParam}=${recipientId}`);
      recordCircuitSuccess("max_api");
    }
  } catch (e: any) {
    if (e.name === "AbortError") {
      console.error(`[maxBot] POST ${recipientParam}=${recipientId} timed out after 15s`);
    } else {
      console.error("[maxBot] POST error:", e);
    }
    recordCircuitFailure("max_api");
  }
}

// ─── Answer callback (required by MAX API after button press) ────────────────

export async function answerMaxCallback(callbackId: string | number, text: string): Promise<void> {
  const token = getToken();
  if (!token) return;
  const url = `${MAX_API}/answers?callback_id=${callbackId}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ notification: { text } }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.error("[maxBot] answerCallback failed:", res.status, await res.text());
    } else {
      console.log(`[maxBot] answerCallback OK id=${callbackId}`);
    }
  } catch (e: any) {
    if (e.name === "AbortError") {
      console.error(`[maxBot] answerCallback id=${callbackId} timed out after 10s`);
    } else {
      console.error("[maxBot] answerCallback error:", e);
    }
  }
}

// ─── Send message (Markdown support) ─────────────────────────────────────────

export async function sendMaxMessage(userId: string | number, text: string): Promise<void> {
  await maxPost("user_id", Number(userId), { text, format: "markdown" });
}

// Send using chat_id (for bot_started events)
export async function sendMaxMessageToChat(chatId: string | number, text: string): Promise<void> {
  await maxPost("chat_id", Number(chatId), { text, format: "markdown" });
}

// ─── Onboarding memo (sent only on first accepted order) ─────────────────────

const ONBOARDING_MESSAGES = [
  `📋 *Памятка мастера — как это работает:*

1️⃣ Я присылаю вам заявку: вид работ, площадь, примерная сумма, адрес.

2️⃣ Если берёте — сразу присылаю контакт заказчика.

3️⃣ Звоните заказчику *в течение 10–15 минут*. Представьтесь, скажите что номер дал прораб, договоритесь на осмотр. По ценам — озвучивайте рыночные, без крайностей. Это влияет на ваш рейтинг и количество заказов.

4️⃣ Большинство наших заказов срочные — готовы начать в течение нескольких дней.

5️⃣ Минимальная сумма заказа — *15 000 ₽* (даже если одну полосу обоев поклеить).

6️⃣ После звонка напишите мне: «Созвонились, договорились на завтра в 10:00».`,

  `🏗️ *Как работать после выезда на объект:*

1. Составьте смету в приложении (раздел «Заказ»)
2. Отправьте ссылку клиенту
3. Клиент оплачивает бронь *5 000 ₽* через смету — у вас снимаются лимиты, можно брать новые заявки
4. Вы получаете уведомление в приложении
5. Приступаете к работе

После выезда сделайте *3 фото ДО* начала работ — нужно для акта перед заказчиком. По завершению — *3 фото ПОСЛЕ*.

*Если клиент спрашивает зачем предоплата — объясните:*
✅ Это бронь мастера и даты. Входит в стоимость работ — вы не переплачиваете.
✅ Без брони не могу зарезервировать дату.
✅ Если работы не начнутся по любой причине — предоплата возвращается полностью.

Если клиент категорически отказывается от предоплаты — напишите мне, решим вместе 👍`,

  `⚠️ *Обязательные правила:*

1. ВСЕ заказы проходят через приложение
2. Смета *всегда* составляется в приложении и отправляется клиенту ссылкой
3. Работа начинается *только* после оплаты предоплаты клиентом через смету
4. Без сметы и предоплаты — заказ не считается выполненным в нашей системе, что ведёт к блокировке аккаунта

*Это защищает вас:*
— Клиент забронировал = не соскочит
— Смета зафиксирована = нет споров по сумме
— Всё в приложении = ваш рейтинг растёт = больше заказов`,

  `💡 *И последнее:*

Как клиент внесёт предоплату — вам придёт уведомление в приложение.

Если предоплаты нет в течение 24 часов — *не уговаривайте и не ждите*. Мы сразу готовим для вас новый заказ.

Из 10 клиентов 8 вносят предоплату без проблем. А те двое обычно оказываются проблемными — торгуются, затягивают оплату, придираются. Вам такие не нужны.

Если старый клиент надумает — он оплатит через смету, вы получите уведомление и вернётесь к нему когда будет удобно. *Ваша задача — не ждать, а зарабатывать* 👍

⚠️ Если заказчик пытается договориться напрямую в обход системы — не соглашайтесь. Это ведёт к потере доступа к заказам. Проще взять новый заказ и выполнить его честно.

Минимальный заказ: *15 000 ₽* · Оплата за заказ — токенами через приложение`,
];

/**
 * Sends the onboarding memo to a master via Max.
 * Call this only when master.acceptedOrders === 0 (first ever accepted order).
 * Messages are staggered with 3-second delays to avoid flooding.
 */
export async function sendOnboardingMemo(maxChatId: string | number): Promise<void> {
  const chatId = Number(maxChatId);
  console.log(`[maxBot] Sending onboarding memo to maxChatId=${chatId}`);
  for (let i = 0; i < ONBOARDING_MESSAGES.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 3000));
    await sendMaxMessage(chatId, ONBOARDING_MESSAGES[i]).catch(e =>
      console.error(`[maxBot] Onboarding memo part ${i + 1} error:`, e)
    );
  }
  console.log(`[maxBot] Onboarding memo sent (${ONBOARDING_MESSAGES.length} parts) to maxChatId=${chatId}`);
}

// ─── Send message with inline keyboard buttons ────────────────────────────────

export async function sendMaxWithButtons(
  chatId: string | number,
  text: string,
  buttons: { text: string; payload: string }[][]
): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(`${MAX_API}/messages?user_id=${Number(chatId)}`, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        format: "markdown",
        attachments: [
          {
            type: "inline_keyboard",
            payload: {
              buttons: buttons.map((row) =>
                row.map((btn) => ({ type: "callback", text: btn.text, payload: btn.payload }))
              ),
            },
          },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.text();
      console.error("[maxBot] sendWithButtons failed:", res.status, err);
    } else {
      console.log(`[maxBot] sendWithButtons OK to user_id=${Number(chatId)}`);
    }
  } catch (e: any) {
    if (e.name === "AbortError") {
      console.error(`[maxBot] sendWithButtons to user_id=${Number(chatId)} timed out after 15s`);
    } else {
      console.error("[maxBot] sendWithButtons error:", e);
    }
  }
}

// Same but uses chat_id= (for bot_started events where we only have chat_id)
async function sendMaxWithButtonsToChat(
  chatId: number,
  text: string,
  buttons: { text: string; payload: string }[][]
): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(`${MAX_API}/messages?chat_id=${chatId}`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        format: "markdown",
        attachments: [{
          type: "inline_keyboard",
          payload: {
            buttons: buttons.map(row =>
              row.map(btn => ({ type: "callback", text: btn.text, payload: btn.payload }))
            ),
          },
        }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) console.error("[maxBot] sendWithButtonsToChat failed:", res.status, await res.text());
  } catch (e: any) {
    if (e.name === "AbortError") {
      console.error(`[maxBot] sendWithButtonsToChat to chat_id=${chatId} timed out after 15s`);
    } else {
      console.error("[maxBot] sendWithButtonsToChat error:", e);
    }
  }
}

// ─── Finance snooze helpers ───────────────────────────────────────────────────

// Pending "указать дату" state: userId → { txRef, expiry }
const pendingSnoozeInput = new Map<number, { txRef: string; expiry: number }>();

function parseSnoozeDate(text: string): Date | null {
  const t = text.trim().toLowerCase();
  // "через N дней/недель"
  const throughMatch = t.match(/через\s+(\d+)\s*(день|дня|дней|неделю|недели|недель|нед\.?|д\.?)/);
  if (throughMatch) {
    const n = parseInt(throughMatch[1]);
    const isWeeks = /нед/.test(throughMatch[2]);
    return new Date(Date.now() + n * (isWeeks ? 7 : 1) * 86400_000);
  }
  // Just a number → treat as days
  if (/^\d+$/.test(t)) {
    const days = parseInt(t);
    if (days > 0 && days <= 365) return new Date(Date.now() + days * 86400_000);
  }
  // dd.mm or dd.mm.yyyy
  const dateMatch = t.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]) - 1;
    const year = dateMatch[3] ? parseInt(dateMatch[3]) : new Date().getFullYear();
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      if (d > new Date()) return d;
      // If date is in the past, try next year
      return new Date(year + 1, month, day);
    }
  }
  return null;
}

async function applyFinanceSnooze(txRef: string, masterId: number, snoozeUntil: Date, note: string): Promise<void> {
  const { db: fdb, transactionsTable: ftt } = await import("@workspace/db");
  const { eq, and, inArray: fIn, sql: fsql } = await import("drizzle-orm");
  if (txRef.startsWith("all:")) {
    await fdb.execute(fsql`
      UPDATE transactions
      SET snooze_until = ${snoozeUntil.toISOString()}, snooze_note = ${note}
      WHERE master_id = ${masterId} AND payment_status IN ('pending', 'overdue')
    `);
  } else {
    const txId = parseInt(txRef);
    if (isNaN(txId)) return;
    await fdb.execute(fsql`
      UPDATE transactions
      SET snooze_until = ${snoozeUntil.toISOString()}, snooze_note = ${note}
      WHERE id = ${txId} AND master_id = ${masterId}
    `);
  }
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

// ── Dedup: Max sometimes delivers the same webhook twice (with delays up to 10+ min) ─────
const _processedMaxMids = new Set<string>();
function isMaxDuplicateMemory(update: Record<string, unknown>): boolean {
  const mid = (update as any).message?.body?.mid ?? (update as any).callback?.message?.body?.mid;
  if (!mid) return false;
  if (_processedMaxMids.has(mid)) {
    console.log(`[maxBot] duplicate mid ignored (memory): ${mid}`);
    return true;
  }
  _processedMaxMids.add(mid);
  // 15-minute TTL — covers Max's worst-case webhook retry window
  setTimeout(() => _processedMaxMids.delete(mid), 15 * 60 * 1000);
  return false;
}

// DB-level dedup: survives server restarts. Returns true if mid already stored in master_messages.
async function isMaxDuplicateDb(mid: string): Promise<boolean> {
  try {
    const { db, masterMessagesTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const rows = await db.select({ id: masterMessagesTable.id })
      .from(masterMessagesTable)
      .where(eq(masterMessagesTable.maxMid, mid))
      .limit(1);
    if (rows.length > 0) {
      console.log(`[maxBot] duplicate mid ignored (db): ${mid}`);
      return true;
    }
  } catch (e) {
    console.error("[maxBot] db dedup check failed:", e);
  }
  return false;
}

export async function handleMaxUpdate(update: Record<string, unknown>): Promise<void> {
  // Fast in-memory dedup (15-min TTL, cleared on restart)
  if (isMaxDuplicateMemory(update)) return;
  try {
    const updateType = update.update_type as string;
    console.log("[maxBot] incoming update:", JSON.stringify(update).slice(0, 500));

    // ── Checkin button callback ───────────────────────────────────────────────
    if (updateType === "message_callback") {
      const callback = (update as any).callback;
      const userId: number = callback?.user?.user_id;
      const payload: string = callback?.payload ?? "";
      const callbackId: string = callback?.callback_id ?? "";

      if (!userId) return;

      // ── New user: "already registered?" response ──────────────────────────
      if (payload === "new:yes") {
        await sendMaxMessage(userId,
          `Отлично! Войдите в приложение — после входа бот подключится автоматически:\nhttps://sfera-master.ru/master-pwa?max=${userId}`
        );
        if (callbackId) await answerMaxCallback(callbackId, "✅ Ответ принят");
        return;
      }

      if (payload === "new:no") {
        await sendOnboarding(userId);
        if (callbackId) await answerMaxCallback(callbackId, "✅ Ответ принят");
        return;
      }

      // ── Finance snooze callbacks ────────────────────────────────────────────
      if (payload.startsWith("fin:")) {
        const { db: fdb, mastersTable: fMt } = await import("@workspace/db");
        const { isNotNull: fIn } = await import("drizzle-orm");
        const allMasters = await fdb.select().from(fMt).where(fIn(fMt.maxChatId));
        const master = allMasters.find(m => m.maxChatId === String(userId));
        if (!master) {
          await sendMaxMessage(userId, "❌ Аккаунт не найден.");
          return;
        }

        if (payload.startsWith("fin:paid:")) {
          await sendMaxMessage(userId,
            `✅ Принято! Мы проверим поступление в течение 24 часов.\n\nЕсли возникнут вопросы — свяжемся с вами.`
          );
          if (callbackId) await answerMaxCallback(callbackId, "✅ Принято!");
          return;
        }

        if (payload.startsWith("fin:snooze:custom:")) {
          const txRef = payload.replace("fin:snooze:custom:", "");
          pendingSnoozeInput.set(userId, { txRef, expiry: Date.now() + 10 * 60_000 });
          await sendMaxMessage(userId,
            `📅 Укажите дату, до которой планируете перевести оплату.\n\n` +
            `Можно написать:\n• **25.04** или **25.04.2026**\n• **через 10 дней** или **через 2 недели**`
          );
          if (callbackId) await answerMaxCallback(callbackId, "✅ Ответ принят");
          return;
        }

        // fin:snooze:N:txRef
        const parts = payload.split(":");
        if (parts[0] === "fin" && parts[1] === "snooze") {
          const days = parseInt(parts[2]);
          const txRef = parts.slice(3).join(":");
          const snoozeUntil = new Date(Date.now() + days * 86400_000);
          const snoozeLabel = snoozeUntil.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
          await applyFinanceSnooze(txRef, master.id, snoozeUntil, `Мастер запросил отсрочку на ${days} дней`);
          await sendMaxMessage(userId,
            `✅ Принято! Следующее напоминание придёт **${snoozeLabel}**.\n\nЕсли закроете раньше — просто переведите комиссию в приложении.`
          );
          if (callbackId) await answerMaxCallback(callbackId, "✅ Принято!");
          return;
        }
        if (callbackId) await answerMaxCallback(callbackId, "✅ Ответ принят");
        return;
      }

      if (!payload.startsWith("checkin:")) return;

      const { db, mastersTable, masterCheckinsTable } = await import("@workspace/db");
      const { eq, isNotNull, and } = await import("drizzle-orm");

      const masters = await db.select().from(mastersTable).where(isNotNull(mastersTable.maxChatId));
      const master = masters.find((m) => m.maxChatId === String(userId));

      if (!master) {
        await sendMaxMessage(userId, "❌ Аккаунт не найден. Отправьте номер телефона для привязки.");
        if (callbackId) await answerMaxCallback(callbackId, "❌ Ошибка");
        return;
      }

      // ── Handle reason after "не готов" ───────────────────────────────────
      if (payload.startsWith("checkin:reason:")) {
        const reason = payload.replace("checkin:reason:", "");
        const today = new Date().toISOString().split("T")[0];
        await db
          .update(masterCheckinsTable)
          .set({ reason })
          .where(and(eq(masterCheckinsTable.masterId, master.id), eq(masterCheckinsTable.date, today)));
        const labels: Record<string, string> = {
          vacation: "отпуск",
          sick: "болезнь",
          busy: "занят на объекте",
          other: "другое",
        };
        await sendMaxMessage(userId, `✅ Понял, причина записана: **${labels[reason] ?? reason}**. Если планы изменятся — напишите нам.`);
        if (callbackId) await answerMaxCallback(callbackId, `✅ Понял!`);
        return;
      }

      // ── Handle yes / no ───────────────────────────────────────────────────
      const isAvailable = payload === "checkin:yes";
      const today = new Date().toISOString().split("T")[0];

      const existing = await db
        .select()
        .from(masterCheckinsTable)
        .where(and(eq(masterCheckinsTable.masterId, master.id), eq(masterCheckinsTable.date, today)));

      if (existing.length > 0) {
        await db
          .update(masterCheckinsTable)
          .set({ isAvailable, respondedAt: new Date() })
          .where(eq(masterCheckinsTable.id, existing[0].id));
      } else {
        await db.insert(masterCheckinsTable).values({
          masterId: master.id,
          date: today,
          isAvailable,
          respondedAt: new Date(),
        });
      }

      if (isAvailable) {
        await sendMaxMessage(userId, "✅ Отлично! Вы отмечены как **готов к заказам**. Удачного рабочего дня!");
        if (callbackId) await answerMaxCallback(callbackId, "✅ Отлично! Готов к заказам!");
      } else {
        await sendMaxWithButtons(
          userId,
          "👌 Понял, вы **не готовы** сегодня. Подскажите причину:",
          [
            [
              { text: "🏖 Отпуск", payload: "checkin:reason:vacation" },
              { text: "🤒 Болезнь", payload: "checkin:reason:sick" },
            ],
            [
              { text: "🔧 Занят на объекте", payload: "checkin:reason:busy" },
              { text: "🔘 Другое", payload: "checkin:reason:other" },
            ],
          ]
        );
        if (callbackId) await answerMaxCallback(callbackId, "👌 Понял, не готовы");
      }
      return;
    }

    if (updateType === "bot_started") {
      const u = update as any;
      const chatId: number = u.chat_id ?? u.user?.user_id ?? 0;
      console.log("[maxBot] bot_started, chatId:", chatId, "keys:", Object.keys(u).join(","));
      if (!chatId) return;

      const { db: dbBs, mastersTable: mtBs } = await import("@workspace/db");
      const { isNotNull: inBs } = await import("drizzle-orm");
      const allBs = await dbBs.select().from(mtBs).where(inBs(mtBs.maxChatId));
      const alreadyLinked = allBs.find(m => m.maxChatId === String(chatId));

      if (alreadyLinked) {
        await sendLoginLink(chatId, alreadyLinked.alias);
      } else {
        await sendNewUserGreeting(chatId);
      }
      return;
    }

    if (updateType !== "message_created") return;

    const msg = (update as any).message;
    if (!msg) return;

    const userId: number = msg.sender?.user_id;
    const text: string = (msg.body?.text ?? "").trim();
    const mid: string | undefined = msg.body?.mid;

    if (!userId || !text) return;

    // DB-level dedup: check if this mid was already processed (survives server restarts)
    if (mid && await isMaxDuplicateDb(mid)) return;

    const { db, mastersTable, masterMessagesTable } = await import("@workspace/db");
    const { eq, isNotNull } = await import("drizzle-orm");

    const lc = text.toLowerCase();

    // ── Pending snooze date input ─────────────────────────────────────────────
    const pendingSnooze = pendingSnoozeInput.get(userId);
    if (pendingSnooze) {
      if (Date.now() > pendingSnooze.expiry) {
        pendingSnoozeInput.delete(userId);
      } else {
        pendingSnoozeInput.delete(userId);
        const parsed = parseSnoozeDate(text);
        if (!parsed) {
          await sendMaxMessage(userId,
            `❌ Не смог разобрать дату. Попробуйте написать:\n• **25.04** или **25.04.2026**\n• **через 7 дней** или **через 2 недели**`
          );
          return;
        }
        // Find the master
        const { db: sdb, mastersTable: smt } = await import("@workspace/db");
        const { isNotNull: sIn } = await import("drizzle-orm");
        const allM = await sdb.select().from(smt).where(sIn(smt.maxChatId));
        const snoozeM = allM.find(m => m.maxChatId === String(userId));
        if (snoozeM) {
          await applyFinanceSnooze(pendingSnooze.txRef, snoozeM.id, parsed,
            `Дата указана мастером: ${text}`);
        }
        const label = parsed.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
        await sendMaxMessage(userId,
          `✅ Принято! Напомним об оплате **${label}**.\n\nЕсли закроете раньше — просто переведите комиссию в приложении.`
        );
        return;
      }
    }

    // ── /start or "регистрация" ───────────────────────────────────────────────
    if (text.startsWith("/start") || ["регистрация", "зарегистрироваться", "register"].includes(lc)) {
      const { db: dbSt, mastersTable: mtSt } = await import("@workspace/db");
      const { isNotNull: inSt } = await import("drizzle-orm");
      const allSt = await dbSt.select().from(mtSt).where(inSt(mtSt.maxChatId));
      const alreadyLinkedSt = allSt.find(m => m.maxChatId === String(userId));
      if (alreadyLinkedSt) {
        await sendMaxMessage(userId, `👋 С возвращением, **${alreadyLinkedSt.alias}**!\n\n📲 Войдите в приложение:\nhttps://sfera-master.ru/master-pwa`);
      } else {
        await sendMaxWithButtons(userId,
          `👋 Добро пожаловать в **Честный мастер**!\n\nВы уже зарегистрированы в нашем приложении?`,
          [[
            { text: "✅ Да, есть аккаунт", payload: "new:yes" },
            { text: "❌ Нет, впервые", payload: "new:no" },
          ]]
        );
      }
      return;
    }

    // ── Если мастер уже привязан → сохраняем сообщение в CRM чат ─────────────
    {
      const allLinked = await db.select().from(mastersTable).where(isNotNull(mastersTable.maxChatId));
      const linkedMaster = allLinked.find(m => m.maxChatId === String(userId));

      if (linkedMaster) {
        // Отвязка — обрабатываем специально
        if (lc === "/отвязать" || lc === "отвязать") {
          await db.update(mastersTable).set({ maxChatId: null }).where(eq(mastersTable.id, linkedMaster.id));
          logMaxEvent(linkedMaster.id, userId, "unlinked_bot", `Мастер ${linkedMaster.alias} отвязал аккаунт через бот`).catch(() => {});
          clearPending(userId);
          await sendMaxMessage(
            userId,
            `✅ Аккаунт **${linkedMaster.alias}** отвязан.\n\nВы больше не будете получать уведомления. Чтобы привязать снова — отправьте номер телефона.`
          );
          return;
        }

        // Сохраняем сообщение мастера в CRM чат (maxMid нужен для DB-дедупликации)
        await db.insert(masterMessagesTable).values({
          masterId: linkedMaster.id,
          telegramChatId: `max_${userId}`,
          text,
          fromMaster: true,
          senderName: linkedMaster.alias,
          isRead: false,
          ...(mid ? { maxMid: mid } : {}),
        });

        console.log(`[maxBot] message from master ${linkedMaster.alias} → AI dispatcher`);

        // AI-диспетчер отвечает вместо "Сообщение передано оператору"
        const { handleMasterMessage } = await import("./lib/dispatcherAI.js");
        handleMasterMessage(linkedMaster.id, linkedMaster.alias, String(userId), text).catch(async e => {
          console.error("[maxBot] dispatcherAI error:", e);
          const fallback = "Принял! Если что-то срочное — операторы перезвонят.";
          await sendMaxMessage(userId, fallback).catch(() => {});
          // Сохраняем fallback-сообщение в CRM чтобы оно отображалось в диалоге
          try {
            const { db: dbInner, masterMessagesTable: mmTable } = await import("@workspace/db");
            await dbInner.insert(mmTable).values({
              masterId: linkedMaster.id,
              telegramChatId: `max_${userId}`,
              text: fallback,
              fromMaster: false,
              senderName: "Диспетчер",
              isRead: true,
            });
          } catch {}
        });
        return;
      }
    }

    // ── Отвязать аккаунт (не привязан) ───────────────────────────────────────
    if (lc === "/отвязать" || lc === "отвязать") {
      const masters = await db.select().from(mastersTable).where(isNotNull(mastersTable.maxChatId));
      const linked = masters.find(m => m.maxChatId === String(userId));

      if (!linked) {
        await sendMaxMessage(userId, "❌ Ваш аккаунт не привязан к боту.");
        return;
      }

      await db.update(mastersTable)
        .set({ maxChatId: null })
        .where(eq(mastersTable.id, linked.id));

      logMaxEvent(linked.id, userId, "unlinked_bot", `Мастер ${linked.alias} отвязал аккаунт через бот`).catch(() => {});
      clearPending(userId);

      await sendMaxMessage(
        userId,
        `✅ Аккаунт **${linked.alias}** отвязан.\n\nВы больше не будете получать уведомления. Чтобы привязать снова — отправьте номер телефона.`
      );
      return;
    }

    // ── Ожидает подтверждения ─────────────────────────────────────────────────
    const pending = getPending(userId);
    if (pending) {
      const digits = text.replace(/\D/g, "");
      const isPhone = digits.length >= 10;

      if (isPhone) {
        // Новый номер — начинаем заново
        clearPending(userId);
      } else if (["да", "yes", "+", "ок", "ok", "подтверждаю"].includes(lc)) {
        // Подтверждение (обычная привязка или замена старого аккаунта)
        await db.update(mastersTable)
          .set({ maxChatId: String(userId) })
          .where(eq(mastersTable.id, pending.masterId));

        const eventType = pending.override ? "relinked" : "linked";
        const eventNote = pending.override
          ? `Мастер ${pending.masterName} заменил привязку на новый аккаунт Max`
          : `Мастер ${pending.masterName} подтвердил привязку аккаунта`;
        logMaxEvent(pending.masterId, userId, eventType, eventNote).catch(() => {});
        clearPending(userId);

        await sendMaxMessage(
          userId,
          `✅ Аккаунт привязан, **${pending.masterName}**!\n\nТеперь вы будете получать уведомления:\n• Новые заявки на выбор\n• Назначение на заявку\n• Подтверждение оплаты\n• Сообщения от оператора\n\nЧтобы отвязать аккаунт — напишите _отвязать_.`
        );

        // Welcome message with link to work rules — only on first-time link
        await sendMaxMessage(
          userId,
          `✅ Отлично, вы зарегистрированы!\n\nПеред тем как получить первый заказ — прочитайте инструкцию. Это займёт 5 минут и поможет зарабатывать больше 👇\n\n📋 Инструкция для мастера:\nhttps://sfera-master.ru/master-pwa/work-rules\n\nЧто внутри:\n— Как получать заказы\n— Как работает смета\n— Как работает предоплата\n— Как зарабатывать больше\n— Правила на объекте\n— Бонусы для лучших мастеров\n\nПервая заявка может прийти уже сегодня! 🔥\n\nЕсли есть вопросы — напишите прямо в этот чат.`
        );

        return;
      } else if (["нет", "no", "-", "отмена", "cancel"].includes(lc)) {
        // Отмена
        logMaxEvent(pending.masterId, userId, "confirm_rejected", `Мастер ${pending.masterName} отклонил привязку`).catch(() => {});
        clearPending(userId);

        await sendMaxMessage(userId, "❌ Привязка отменена.\n\nЕсли захотите привязаться позже — просто отправьте номер телефона.");
        return;
      } else {
        // Непонятный ответ
        await sendMaxMessage(
          userId,
          `⏳ Ожидаю подтверждения для аккаунта **${pending.masterName}**.\n\nОтветьте **ДА** для привязки или **НЕТ** для отмены.`
        );
        return;
      }
    }

    // ── Ввод номера телефона ──────────────────────────────────────────────────
    const digits = text.replace(/\D/g, "");
    if (digits.length >= 10) {
      const last10 = digits.slice(-10);

      const masters = await db.select().from(mastersTable).where(isNotNull(mastersTable.phone));
      const master = masters.find(m => {
        if (!m.phone) return false;
        return m.phone.replace(/\D/g, "").slice(-10) === last10;
      });

      if (master) {
        // Уже привязан этот же userId
        if (master.maxChatId === String(userId)) {
          await sendMaxMessage(userId, `✅ Аккаунт **${master.alias}** уже привязан к вам.`);
          return;
        }

        const parts = master.contractFullName?.split(" ") ?? [];
        const name = parts[1] ?? parts[0] ?? master.alias;

        // Привязан другой аккаунт Max — предлагаем заменить
        if (master.maxChatId && master.maxChatId !== String(userId)) {
          setPending(userId, master.id, name, true /* override */);
          logMaxEvent(master.id, userId, "override_pending", `Мастер ${master.alias} запросил переподвязку аккаунта`).catch(() => {});
          await sendMaxMessage(
            userId,
            `⚠️ Аккаунт **${master.alias}** уже привязан к другому профилю Max.\n\nЕсли это ваш аккаунт и вы хотите перенести привязку на этот профиль — ответьте **ДА**.\n\nЧтобы отменить — ответьте **НЕТ**.\n\n_Запрос действителен 5 минут._`
          );
          return;
        }

        // Сохраняем ожидание подтверждения (обычная привязка)
        setPending(userId, master.id, name);
        logMaxEvent(master.id, userId, "confirm_pending", `Найден мастер ${master.alias}, ожидает подтверждения`).catch(() => {});

        await sendMaxMessage(
          userId,
          `🔍 Найден аккаунт: **${master.alias}**${master.city ? ` (${master.city})` : ""}.\n\nПодтвердите привязку — ответьте **ДА** или **НЕТ**.\n\n_Запрос действителен 5 минут._`
        );
      } else {
        logMaxEvent(null, userId, "not_found_send_link", `Телефон не найден, отправлена ссылка на регистрацию: ${text}`).catch(() => {});
        await sendMaxMessage(
          userId,
          `❌ Мастер с номером **${text}** не найден.\n\n📲 Зарегистрируйтесь в приложении:\nhttps://sfera-master.ru/master-pwa?max=${userId}\n\n_После регистрации бот будет автоматически привязан._`
        );
      }
      return;
    }

    // ── Непонятное сообщение ──────────────────────────────────────────────────
    await sendMaxMessage(
      userId,
      "Отправьте ваш номер телефона (например: +79001234567) для привязки аккаунта.\n\nЧтобы отвязать аккаунт — напишите _отвязать_."
    );
  } catch (e) {
    console.error("[maxBot] handleUpdate error:", e);
  }
}

// ─── Register webhook ─────────────────────────────────────────────────────────

export async function registerWebhook(webhookUrl: string): Promise<void> {
  const token = getToken();
  if (!token) {
    console.log("[maxBot] MAX_BOT_TOKEN not set, skipping webhook");
    return;
  }
  try {
    const res = await fetch(`${MAX_API}/subscriptions`, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: webhookUrl,
        update_types: ["message_created", "bot_started", "message_callback"],
      }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log("[maxBot] webhook registered:", webhookUrl);
    } else {
      console.error("[maxBot] webhook registration failed:", data);
    }
  } catch (e) {
    console.error("[maxBot] webhook register error:", e);
  }
}
