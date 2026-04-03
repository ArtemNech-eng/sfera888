const MAX_API = "https://platform-api.max.ru";

function getToken(): string | undefined {
  return process.env.MAX_BOT_TOKEN;
}

// ─── Pending link confirmations (in-memory, 5 min TTL) ────────────────────────

interface PendingLink {
  masterId: number;
  masterName: string;
  expiry: number;
}
const pendingLinks = new Map<number, PendingLink>();

function setPending(userId: number, masterId: number, masterName: string) {
  pendingLinks.set(userId, { masterId, masterName, expiry: Date.now() + 5 * 60_000 });
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

// ─── Send message (Markdown support) ─────────────────────────────────────────

export async function sendMaxMessage(chatId: string | number, text: string): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${MAX_API}/messages`, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: Number(chatId), text, format: "markdown" }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[maxBot] send failed:", res.status, err);
    }
  } catch (e) {
    console.error("[maxBot] send error:", e);
  }
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
    const res = await fetch(`${MAX_API}/messages`, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: Number(chatId),
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
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[maxBot] sendWithButtons failed:", res.status, err);
    }
  } catch (e) {
    console.error("[maxBot] sendWithButtons error:", e);
  }
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

export async function handleMaxUpdate(update: Record<string, unknown>): Promise<void> {
  try {
    const updateType = update.update_type as string;

    // ── Checkin button callback ───────────────────────────────────────────────
    if (updateType === "message_callback") {
      const callback = (update as any).callback;
      const userId: number = callback?.user?.user_id;
      const payload: string = callback?.payload ?? "";

      if (!userId || !payload.startsWith("checkin:")) return;

      const isAvailable = payload === "checkin:yes";
      const today = new Date().toISOString().split("T")[0];

      const { db, mastersTable, masterCheckinsTable } = await import("@workspace/db");
      const { eq, isNotNull, and } = await import("drizzle-orm");

      const masters = await db.select().from(mastersTable).where(isNotNull(mastersTable.maxChatId));
      const master = masters.find((m) => m.maxChatId === String(userId));

      if (!master) {
        await sendMaxMessage(userId, "❌ Аккаунт не найден. Отправьте номер телефона для привязки.");
        return;
      }

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

      const reply = isAvailable
        ? "✅ Отлично! Вы отмечены как **готов к заказам**. Удачного рабочего дня!"
        : "👌 Понял, вы **не готовы** сегодня. Если планы изменятся — напишите нам.";

      await sendMaxMessage(userId, reply);
      return;
    }

    if (updateType === "bot_started") {
      // Max API can put user id in different places — try all known paths
      const u = update as any;
      const chatId: number =
        u.user?.user_id ??
        u.message?.sender?.user_id ??
        u.chat_id ??
        u.user_id ??
        0;
      console.log("[maxBot] bot_started event, extracted chatId:", chatId, "raw keys:", Object.keys(u).join(","));
      if (chatId) {
        await sendMaxMessage(
          chatId,
          "👋 Привет! Это бот **Честный мастер**.\n\nОтправьте ваш номер телефона, чтобы привязать аккаунт мастера и получать уведомления о новых заявках, сметах и оплатах."
        );
      }
      return;
    }

    if (updateType !== "message_created") return;

    const msg = (update as any).message;
    if (!msg) return;

    const userId: number = msg.sender?.user_id;
    const text: string = (msg.body?.text ?? "").trim();

    if (!userId || !text) return;

    const { db, mastersTable } = await import("@workspace/db");
    const { eq, isNotNull } = await import("drizzle-orm");

    // ── /start ────────────────────────────────────────────────────────────────
    if (text.startsWith("/start")) {
      await sendMaxMessage(
        userId,
        "👋 Привет! Это бот **Честный мастер**.\n\nОтправьте ваш номер телефона, чтобы привязать аккаунт мастера и получать уведомления о новых заявках, сметах и оплатах."
      );
      return;
    }

    // ── Отвязать аккаунт ──────────────────────────────────────────────────────
    const lc = text.toLowerCase();
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
        // Подтверждение
        await db.update(mastersTable)
          .set({ maxChatId: String(userId) })
          .where(eq(mastersTable.id, pending.masterId));

        logMaxEvent(pending.masterId, userId, "linked", `Мастер ${pending.masterName} подтвердил привязку аккаунта`).catch(() => {});
        clearPending(userId);

        await sendMaxMessage(
          userId,
          `✅ Аккаунт привязан, **${pending.masterName}**!\n\nТеперь вы будете получать уведомления:\n• Новые заявки на выбор\n• Назначение на заявку\n• Подтверждение оплаты\n• Сообщения от оператора\n\nЧтобы отвязать аккаунт — напишите _отвязать_.`
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
        // Уже привязан другой аккаунт Max?
        if (master.maxChatId && master.maxChatId !== String(userId)) {
          await sendMaxMessage(
            userId,
            `⚠️ Аккаунт **${master.alias}** уже привязан к другому пользователю Max.\n\nОбратитесь к администратору.`
          );
          return;
        }

        // Уже привязан этот же userId
        if (master.maxChatId === String(userId)) {
          await sendMaxMessage(userId, `✅ Аккаунт **${master.alias}** уже привязан к вам.`);
          return;
        }

        const name = master.contractFullName?.split(" ")[0] || master.alias;

        // Сохраняем ожидание подтверждения
        setPending(userId, master.id, name);
        logMaxEvent(master.id, userId, "confirm_pending", `Найден мастер ${master.alias}, ожидает подтверждения`).catch(() => {});

        await sendMaxMessage(
          userId,
          `🔍 Найден аккаунт: **${master.alias}**${master.city ? ` (${master.city})` : ""}.\n\nПодтвердите привязку — ответьте **ДА** или **НЕТ**.\n\n_Запрос действителен 5 минут._`
        );
      } else {
        logMaxEvent(null, userId, "not_found", `Телефон не найден: ${text}`).catch(() => {});
        await sendMaxMessage(
          userId,
          "❌ Мастер с таким номером не найден.\n\nПроверьте номер или обратитесь к администратору."
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
