/**
 * Notification_Service — каскад каналов доставки уведомлений для гео-сообщества
 * «ХочуТакже».
 *
 * Каскад выбора канала (Requirement 15):
 *   1. Max_Bot подключён                    → Max          (R15.1)
 *   2. Max_Bot не подключён                 → Web_Push     (R15.2)
 *   3. Событие важное И Max_Bot не подключён → SMS          (R15.3)
 *
 * Ключевой инвариант (Requirement 15.4): недоступность Max_Bot НЕ должна
 * блокировать оставление лида, оплату или индексацию контента. Поэтому весь
 * модуль спроектирован так, что доставка уведомления НИКОГДА не бросает
 * исключение наружу — любые сбои каналов проглатываются и логируются, а
 * `notify()` возвращает структурированный результат вместо ошибки. Вызывающие
 * стороны lead/payment/indexing-потоков могут звать `notify()` в режиме
 * «fire-and-forget», не оборачивая его в try/catch.
 *
 * Модуль намеренно разделён на два уровня:
 *   1. `selectChannel({ maxConnected, important })` — чистая, детерминированная
 *      функция решения. Не трогает БД/сеть, легко покрывается property-тестом
 *      (Task 10.2, Property 10).
 *   2. `notify(recipient, event)` — применяет каскад, используя существующую
 *      инфраструктуру (`sendMaxMessage`, `sendPushToClient`, `sendSms`).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (Task 10.1, Requirements 15.1–15.4)
 */

import { sendMaxMessage } from "../maxBot.js";
import { sendPushToClient } from "./clientPush.js";

/** Каналы доставки в порядке приоритета каскада. */
export type NotificationChannel = "max" | "web_push" | "sms";

/** Вход чистой функции решения канала. */
export interface ChannelDecisionInput {
  /** Подключён ли у получателя Max_Bot (наличие `max_user_id`). */
  maxConnected: boolean;
  /** Помечено ли событие как важное (влияет на выбор SMS). */
  important: boolean;
}

/** Получатель уведомления (проекция `community_accounts`). */
export interface NotificationRecipient {
  /** Телефон в любом формате — нормализуется внутри каналов (Web_Push/SMS). */
  phone: string;
  /**
   * Опциональный идентификатор Max_Login (`community_accounts.max_user_id`).
   * Пустое/`null`/`undefined` значение означает, что Max_Bot НЕ подключён.
   */
  maxUserId?: string | number | null;
}

/** Событие уведомления. */
export interface NotificationEvent {
  /** Короткий заголовок (для Web_Push / префикса Max/SMS). */
  title?: string;
  /** Текст уведомления. */
  body: string;
  /** Важное событие → при отсутствии Max доставляется через SMS (R15.3). */
  important?: boolean;
  /** Необязательная ссылка (используется в payload Web_Push). */
  url?: string;
}

/** Результат попытки доставки. Никогда не бросается — только возвращается. */
export interface NotifyResult {
  /** Канал, выбранный каскадом для данного получателя/события. */
  channel: NotificationChannel;
  /** Успешно ли отправлено. `false` при проглоченной ошибке канала. */
  delivered: boolean;
  /** Причина неудачи (для логов/тестов), если `delivered === false`. */
  error?: string;
}

/**
 * Считать получателя «подключённым к Max», если у него есть непустой
 * `max_user_id`. Пустая строка, `0`, `null`, `undefined` → не подключён.
 */
export function isMaxConnected(recipient: NotificationRecipient): boolean {
  const id = recipient.maxUserId;
  if (id === null || id === undefined) return false;
  if (typeof id === "number") return Number.isFinite(id) && id !== 0;
  return id.trim().length > 0;
}

/**
 * Чистая детерминированная функция выбора канала (Requirements 15.1–15.3).
 *
 * Таблица решений однозначно определяется парой (maxConnected, important):
 *
 *   | maxConnected | important | channel   |
 *   | ------------ | --------- | --------- |
 *   | true         | *         | max       |
 *   | false        | true      | sms       |
 *   | false        | false     | web_push  |
 *
 * Max имеет приоритет всегда при подключении — важность события влияет на
 * выбор только когда Max НЕ подключён (важное → SMS, обычное → Web_Push).
 */
export function selectChannel({ maxConnected, important }: ChannelDecisionInput): NotificationChannel {
  if (maxConnected) return "max"; // R15.1
  if (important) return "sms"; // R15.3
  return "web_push"; // R15.2
}

/**
 * Тонкий стаб SMS-отправителя. Реальная интеграция с SMS-провайдером ещё не
 * подключена в проекте (grep по `sms` не нашёл отправителя), поэтому здесь —
 * env-охраняемая заглушка вместо выдуманной интеграции.
 *
 * TODO(hochu-takzhe-community): подключить реального SMS-провайдера. Ожидается
 * env `SMS_PROVIDER_API_KEY` (+ доменные настройки). До настройки провайдера
 * функция помечает доставку как невыполненную (`false`), но НИКОГДА не бросает
 * исключение — недоступность SMS не должна ломать вызывающий поток (R15.4).
 *
 * @returns `true` при (будущей) успешной отправке, `false` если провайдер не
 *          сконфигурирован или отправка не удалась.
 */
export async function sendSms(phone: string, text: string): Promise<boolean> {
  const apiKey = process.env["SMS_PROVIDER_API_KEY"];
  if (!apiKey) {
    console.warn(
      `[communityNotifications] SMS-провайдер не сконфигурирован (SMS_PROVIDER_API_KEY отсутствует); ` +
        `сообщение для ${maskPhone(phone)} не отправлено (stub).`,
    );
    return false;
  }

  // TODO(hochu-takzhe-community): здесь будет реальный вызов SMS-провайдера,
  // например `await smsClient.send({ to: phone, text })`. Пока провайдер не
  // подключён — считаем доставку невыполненной, но не бросаем ошибку.
  void text;
  console.warn(
    `[communityNotifications] sendSms вызван, но интеграция с провайдером ещё не реализована ` +
      `(получатель ${maskPhone(phone)}).`,
  );
  return false;
}

/**
 * Применить каскад каналов и доставить уведомление получателю.
 *
 * Гарантии (Requirement 15.4):
 *   - НИКОГДА не бросает исключение наружу — любые сбои каналов проглатываются
 *     и логируются;
 *   - безопасно вызывается из lead/payment/indexing-потоков в режиме
 *     fire-and-forget: недоступность Max/Web_Push/SMS не блокирует эти операции.
 *
 * @returns `NotifyResult` с выбранным каналом и флагом фактической доставки.
 */
export async function notify(
  recipient: NotificationRecipient,
  event: NotificationEvent,
): Promise<NotifyResult> {
  const channel = selectChannel({
    maxConnected: isMaxConnected(recipient),
    important: event.important === true,
  });

  try {
    switch (channel) {
      case "max": {
        // isMaxConnected гарантирует непустой id на этой ветке.
        await sendMaxMessage(recipient.maxUserId as string | number, formatText(event));
        return { channel, delivered: true };
      }
      case "web_push": {
        await sendPushToClient(recipient.phone, {
          title: event.title ?? "ХочуТакже",
          body: event.body,
          ...(event.url ? { url: event.url } : {}),
        });
        return { channel, delivered: true };
      }
      case "sms": {
        const ok = await sendSms(recipient.phone, formatText(event));
        return { channel, delivered: ok, ...(ok ? {} : { error: "sms_not_delivered" }) };
      }
    }
  } catch (err) {
    // R15.4: сбой доставки уведомления НИКОГДА не пробрасывается наружу.
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[communityNotifications] доставка по каналу "${channel}" не удалась ` +
        `(получатель ${maskPhone(recipient.phone)}): ${message}`,
    );
    return { channel, delivered: false, error: message };
  }
}

/** Склеить заголовок и тело события в текст для Max/SMS. */
function formatText(event: NotificationEvent): string {
  return event.title ? `${event.title}\n\n${event.body}` : event.body;
}

/** Замаскировать телефон в логах, чтобы не светить PII целиком. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "***";
  return `***${digits.slice(-4)}`;
}
