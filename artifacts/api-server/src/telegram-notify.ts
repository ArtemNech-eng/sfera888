const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function sendTelegramMessage(chatId: string | number, text: string, extra?: object): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", ...extra }),
    });
  } catch (err) {
    console.error("[TelegramNotify] Failed to send message:", err);
  }
}

const mainMenuKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "📋 Доступные заказы", callback_data: "show_orders" }],
      [{ text: "📊 Мои активные заказы", callback_data: "my_orders" }],
      [{ text: "👤 Мой профиль", callback_data: "my_profile" }],
      [{ text: "✉️ Написать оператору", callback_data: "message_operator" }],
    ],
  },
};

export async function notifyMasterActivated(chatId: string, alias: string): Promise<void> {
  await sendTelegramMessage(
    chatId,
    `🎉 <b>Аккаунт активирован!</b>\n\nДобро пожаловать, <b>${alias}</b>!\n\nТеперь вам доступны заказы — выберите действие:`,
    mainMenuKeyboard
  );
}
