const MAX_API = "https://platform-api.max.ru";

function getToken(): string | undefined {
  return process.env.MAX_BOT_TOKEN;
}

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
      body: JSON.stringify({ user_id: Number(chatId), text }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[maxBot] send failed:", res.status, err);
    }
  } catch (e) {
    console.error("[maxBot] send error:", e);
  }
}

export async function handleMaxUpdate(update: Record<string, unknown>): Promise<void> {
  try {
    const updateType = update.update_type as string;

    if (updateType === "bot_started") {
      const chatId = (update as any).chat_id as number;
      if (chatId) {
        await sendMaxMessage(chatId, "👋 Привет! Это бот «Честный мастер».\n\nОтправьте ваш номер телефона, чтобы привязать аккаунт мастера и получать уведомления о новых сметах и оплатах.");
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
    const { eq, or, isNotNull } = await import("drizzle-orm");

    if (text.startsWith("/start")) {
      await sendMaxMessage(userId, "👋 Привет! Это бот «Честный мастер».\n\nОтправьте ваш номер телефона, чтобы привязать аккаунт мастера и получать уведомления о новых сметах и оплатах.");
      return;
    }

    const digits = text.replace(/\D/g, "");
    if (digits.length >= 10) {
      const last10 = digits.slice(-10);

      const masters = await db
        .select()
        .from(mastersTable)
        .where(isNotNull(mastersTable.phone));

      const master = masters.find((m) => {
        if (!m.phone) return false;
        return m.phone.replace(/\D/g, "").slice(-10) === last10;
      });

      if (master) {
        await db
          .update(mastersTable)
          .set({ maxChatId: String(userId) })
          .where(eq(mastersTable.id, master.id));

        const name = master.contractFullName?.split(" ")[0] || master.alias;
        await sendMaxMessage(
          userId,
          `✅ Аккаунт привязан, ${name}!\n\nТеперь вы будете получать уведомления:\n• При создании новой сметы\n• Когда клиент отправит скриншот оплаты`
        );
      } else {
        await sendMaxMessage(
          userId,
          "❌ Мастер с таким номером не найден.\n\nПроверьте номер или обратитесь к администратору."
        );
      }
      return;
    }

    await sendMaxMessage(
      userId,
      "Отправьте ваш номер телефона (например: +79001234567) для привязки аккаунта."
    );
  } catch (e) {
    console.error("[maxBot] handleUpdate error:", e);
  }
}

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
        update_types: ["message_created", "bot_started"],
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
