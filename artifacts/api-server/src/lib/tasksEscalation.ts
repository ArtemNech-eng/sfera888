import { sendMaxMessage } from "../maxBot.js";
import { getOperatorTasks } from "./operatorTasks.js";

// Память: какие задачи мы уже эскалировали и когда.
// Повторное уведомление по той же задаче — не чаще раза в 60 минут.
const lastNotifiedAt = new Map<string, number>();
const REMINDER_INTERVAL_MS = 60 * 60 * 1000;

// Очистка stale ключей (если задача исчезла — забываем)
function pruneNotified(currentIds: Set<string>) {
  for (const key of lastNotifiedAt.keys()) {
    if (!currentIds.has(key)) lastNotifiedAt.delete(key);
  }
}

export async function runTaskEscalations(): Promise<void> {
  const adminUserId = process.env["ADMIN_MAX_USER_ID"];
  if (!adminUserId) return;

  let tasks;
  try {
    tasks = await getOperatorTasks();
  } catch (err) {
    console.error("[escalation] failed to load tasks:", err);
    return;
  }

  const now = Date.now();
  const currentIds = new Set(tasks.map(t => t.id));
  pruneNotified(currentIds);

  // Эскалируем только critical-просроченные
  const critical = tasks.filter(t => t.priority === "critical");
  if (critical.length === 0) return;

  const toNotify = critical.filter(t => {
    const last = lastNotifiedAt.get(t.id);
    return !last || now - last >= REMINDER_INTERVAL_MS;
  });
  if (toNotify.length === 0) return;

  // Группируем в одно сообщение, чтобы не спамить.
  // Если задач больше 10 — показываем первые 10 + счётчик остальных, чтобы не упереться в лимит длины MAX-сообщения.
  const MAX_LINES = 10;
  const shown = toNotify.slice(0, MAX_LINES);
  const rest = toNotify.length - shown.length;

  const lines = shown.map(t => {
    const overdueText = t.overdueMinutes >= 60
      ? `${Math.floor(t.overdueMinutes / 60)}ч ${t.overdueMinutes % 60}м`
      : `${t.overdueMinutes}м`;
    return `🔴 ${t.title}\n   ${t.subtitle}\n   Просрочено на ${overdueText}`;
  });

  const tail = rest > 0 ? `\n\n…и ещё ${rest}` : "";
  const text = `⚠️ Просроченные задачи (${toNotify.length}):\n\n${lines.join("\n\n")}${tail}\n\nОткройте CRM → Главная`;

  try {
    await sendMaxMessage(adminUserId, text);
    for (const t of toNotify) lastNotifiedAt.set(t.id, now);
    console.log(`[escalation] sent reminder for ${toNotify.length} critical tasks`);
  } catch (err) {
    console.error("[escalation] failed to send MAX message:", err);
  }
}
