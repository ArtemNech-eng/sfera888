/**
 * Auth_Service — уровень доступа 2: оставление лида и оплата AI-утилиты
 * (Requirement 10).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (design.md → "Auth_Service",
 * трёхуровневая модель доступа).
 *
 * Этот модуль реализует «гейт уровня 2»: чтобы оставить лид или оплатить
 * AI_Design_Utility за 100 ₽, посетителю достаточно указать **телефон** и
 * пройти **Captcha** (Yandex SmartCaptcha). Полноценная учётная запись здесь не
 * создаётся (это уровень 3, Task 8.3), маршруты не объявляются (Task 8.4).
 *
 * Ключевые требования, зафиксированные в коде:
 *   - R10.1 / R10.2 — лид и оплата требуют телефон + прохождение Captcha.
 *   - R10.3 — при провале Captcha отправка отклоняется и предлагается повтор
 *     (`retry: true`).
 *   - R10.4 — Max_Login НЕ требуется ни на одном шаге. Этот модуль НЕ принимает,
 *     НЕ читает и НЕ проверяет никаких Max-идентификаторов (см. ASSERTION ниже).
 *
 * Проверка Captcha инъектируется (`CaptchaVerifier`), чтобы юнит-тесты могли
 * прогонять логику гейта без сетевого вызова к SmartCaptcha. По умолчанию
 * используется существующий `verifyCaptchaToken` из `./smartCaptcha`.
 */

import { createHash, randomInt } from "node:crypto";
import { db, communityAccountsTable, type CommunityAccount } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyCaptchaToken } from "./smartCaptcha.js";
import { sendSms } from "./communityNotifications.js";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * R10.4 ASSERTION (compile-time + документирующая):
 *
 * Max_Login НЕ является частью контракта этого модуля. Входной тип
 * `LeadContextInput` намеренно НЕ содержит поля вида `maxUserId` / `maxToken`,
 * и логика гейта НИ ПРИ КАКИХ условиях не обращается к Max_Bot. Проверка
 * уровня 2 полностью определяется парой (phone, captcha). Любая будущая правка,
 * добавляющая зависимость от Max на этом шаге, нарушит Requirement 10.4.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Причина отказа гейта уровня 2. */
export type LeadContextRejectionReason =
  /** Телефон не передан или пуст (R10.1/R10.2 — телефон обязателен). */
  | "phone_missing"
  /** Телефон передан, но не является валидным номером РФ. */
  | "phone_invalid"
  /** Captcha-токен не передан (форма отправлена без прохождения капчи). */
  | "captcha_missing"
  /** Captcha не пройдена (SmartCaptcha вернул отказ / сетевая ошибка). */
  | "captcha_failed";

/**
 * Результат проверки контекста лида/оплаты — дискриминированное объединение по
 * полю `ok`.
 *
 * - Успех: `{ ok: true, phone }` — нормализованный телефон в формате `+7XXXXXXXXXX`,
 *   готовый к передаче в Lead_Service / платёжный шаг.
 * - Отказ: `{ ok: false, reason, retry }` — `retry: true` означает, что
 *   пользователю следует предложить повторить проверку Captcha (R10.3).
 */
export type LeadContextResult =
  | { ok: true; phone: string }
  | { ok: false; reason: LeadContextRejectionReason; retry: boolean };

/**
 * Вход гейта уровня 2. Только `phone` + `captchaToken` (+ best-effort IP для
 * SmartCaptcha). Никаких Max-полей — см. R10.4 ASSERTION выше.
 */
export interface LeadContextInput {
  /** Сырой телефон, как введён пользователем (любой человекочитаемый формат). */
  phone: string;
  /** Одноразовый токен SmartCaptcha (`smart-token`) с формы. */
  captchaToken: string;
  /** IP клиента (best-effort) — прокидывается в SmartCaptcha как `ip`. */
  remoteIp?: string | null;
}

/**
 * Инъектируемая проверка Captcha. Сигнатура совместима с `verifyCaptchaToken`,
 * но сведена к минимуму, нужному гейту: возвращаем только «прошло/не прошло».
 * Тесты подставляют детерминированную реализацию без обращения к сети.
 */
export type CaptchaVerifier = (input: {
  token: string;
  remoteIp: string | null;
}) => Promise<{ success: boolean }>;

/**
 * Проверка Captcha по умолчанию — существующий серверный верификатор
 * SmartCaptcha. В не-прод окружении без `SMARTCAPTCHA_SERVER_KEY` он корректно
 * деградирует (см. `smartCaptcha.ts`: dev-режим возвращает `success: true`),
 * поэтому локальная разработка/E2E не блокируются. В проде отсутствие ключа —
 * ошибка деплоя, которую ловит валидация окружения оператора.
 */
const defaultCaptchaVerifier: CaptchaVerifier = async ({ token, remoteIp }) => {
  const result = await verifyCaptchaToken({ token, remoteIp });
  return { success: result.success };
};

/**
 * Нормализовать и провалидировать телефон РФ.
 *
 * Правила нормализации (переиспользуемый паттерн для номеров РФ):
 *   - Оставляем только цифры (любые разделители/скобки/пробелы/дефисы и `+`
 *     отбрасываются).
 *   - Ведущая `8` при 11 цифрах трактуется как национальный префикс → `7`.
 *   - 10 цифр (номер без кода страны) → префиксуем `7`.
 *   - Итог обязан быть 11 цифрами с кодом страны `7`; иначе номер невалиден.
 *
 * Возвращает канонический `+7XXXXXXXXXX` либо `null`, если это не номер РФ.
 */
export function normalizeRuPhone(raw: string): string | null {
  if (typeof raw !== "string") return null;

  let digits = raw.replace(/\D+/g, "");
  if (digits.length === 0) return null;

  // 8XXXXXXXXXX → 7XXXXXXXXXX (национальный префикс междугородней связи).
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = "7" + digits.slice(1);
  }

  // Номер без кода страны (10 цифр) → добавляем код РФ.
  if (digits.length === 10) {
    digits = "7" + digits;
  }

  // После нормализации допустим ровно код страны 7 и 11 цифр.
  if (digits.length !== 11 || !digits.startsWith("7")) {
    return null;
  }

  return "+" + digits;
}

/**
 * Гейт уровня 2 для оставления лида и оплаты AI-утилиты (Requirements 10.1–10.4).
 *
 * Порядок проверок:
 *   1. Телефон обязателен и должен быть валидным номером РФ (R10.1/R10.2).
 *   2. Captcha-токен обязателен и должен пройти проверку SmartCaptcha
 *      (R10.1/R10.2); при провале — отказ с предложением повторить (R10.3).
 *
 * Max_Login не участвует ни на одном шаге (R10.4).
 *
 * @param input        только `{ phone, captchaToken, remoteIp? }`
 * @param verifyCaptcha инъектируемая проверка Captcha (по умолчанию — SmartCaptcha)
 */
export async function verifyLeadContext(
  input: LeadContextInput,
  verifyCaptcha: CaptchaVerifier = defaultCaptchaVerifier,
): Promise<LeadContextResult> {
  // 1) Телефон обязателен (R10.1, R10.2).
  const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (rawPhone.length === 0) {
    return { ok: false, reason: "phone_missing", retry: false };
  }

  const phone = normalizeRuPhone(rawPhone);
  if (phone === null) {
    return { ok: false, reason: "phone_invalid", retry: false };
  }

  // 2) Captcha обязательна (R10.1, R10.2). Отсутствие токена — не провал
  //    проверки, а незаполненная форма: тоже предлагаем повторить.
  const token = typeof input.captchaToken === "string" ? input.captchaToken.trim() : "";
  if (token.length === 0) {
    return { ok: false, reason: "captcha_missing", retry: true };
  }

  const captcha = await verifyCaptcha({ token, remoteIp: input.remoteIp ?? null });
  if (!captcha.success) {
    // R10.3 — при провале Captcha отклоняем и предлагаем повторить.
    return { ok: false, reason: "captcha_failed", retry: true };
  }

  // Успех уровня 2: телефон валиден, Captcha пройдена, Max не требовался (R10.4).
  return { ok: true, phone };
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * Уровень доступа 3 — Community_Account через Phone_Verification (Task 8.3)
 * Requirements 11.1, 11.2, 11.3, 11.4.
 *
 * Модель:
 *   - `requestPhoneCode(phone)` — выпускает одноразовый код и «отправляет» его
 *     (доставка инъектируется, чтобы тесты не слали SMS). В хранилище кладётся
 *     только ХЕШ кода + срок жизни — сам код никогда не персистится в открытом
 *     виде.
 *   - `confirmPhoneCode(phone, code)` — при совпадении кода создаёт (или
 *     дополняет) `Community_Account` с проставленным `phoneVerifiedAt` и НЕМЕДЛЕННО
 *     выдаёт полные права публикации (R11.1, R11.4). Никакого подключения
 *     Max_Bot и никакого ожидания «отдельного создания учётной записи».
 *   - `linkMaxOptional(accountId, maxUserId)` — опциональная привязка Max_Login
 *     (R11.2). Это бонус, а НЕ гейт: права публикации к нему не привязаны.
 *   - `hasPublishingRights(account)` — чистый предикат состояния аккаунта. Если
 *     верификация не завершена (`phoneVerifiedAt == null`), публикация должна
 *     быть отклонена, а черновик сохранён (R11.3; фактическое сохранение
 *     черновика и отказ живут в feed-роутах через `community_thread_drafts`).
 *
 * R11.4 инвариант: права публикации определяются ИСКЛЮЧИТЕЛЬНО фактом
 * Phone_Verification (`phoneVerifiedAt != null`). Max_Login в этот предикат не
 * входит и не может быть обязательным условием.
 * ═════════════════════════════════════════════════════════════════════════
 */

/** Время жизни кода подтверждения по умолчанию — 5 минут. */
export const DEFAULT_CODE_TTL_MS = 5 * 60_000;
/** Длина цифрового кода подтверждения. */
export const VERIFICATION_CODE_LENGTH = 6;
/** Максимум неверных попыток ввода до инвалидации кода. */
export const MAX_CONFIRM_ATTEMPTS = 5;

/** Запись хранилища кодов: только ХЕШ кода, срок и счётчик попыток. */
export interface StoredVerificationCode {
  /** SHA-256 хеш от `${phone}:${code}` — открытый код не хранится. */
  codeHash: string;
  /** Абсолютный момент истечения (epoch ms). */
  expiresAt: number;
  /** Число неверных попыток подтверждения. */
  attempts: number;
}

/**
 * Инъектируемое хранилище кодов. Синхронный/асинхронный API совместим и с
 * in-memory реализацией по умолчанию, и с будущим Redis/БД-бэкендом.
 */
export interface VerificationCodeStore {
  get(phone: string): StoredVerificationCode | undefined | Promise<StoredVerificationCode | undefined>;
  set(phone: string, entry: StoredVerificationCode): void | Promise<void>;
  delete(phone: string): void | Promise<void>;
}

/**
 * In-memory хранилище кодов по умолчанию. Достаточно для single-process
 * dev/тестов; для прод-многопроцессности оператор подменяет реализацию на
 * общий стор (Redis) через `PhoneVerificationDeps.store`.
 */
export function createInMemoryCodeStore(): VerificationCodeStore {
  const map = new Map<string, StoredVerificationCode>();
  return {
    get: (phone) => map.get(phone),
    set: (phone, entry) => {
      map.set(phone, entry);
    },
    delete: (phone) => {
      map.delete(phone);
    },
  };
}

/** Модульный стор по умолчанию (переиспользуется между вызовами процесса). */
const moduleCodeStore = createInMemoryCodeStore();

/**
 * Инъектируемая доставка кода. Сигнатура минимальна: `{ phone, code }`. Тесты
 * подставляют перехватчик и НЕ шлют SMS. По умолчанию — SMS-путь из
 * `communityNotifications` (сам по себе env-охраняемый: без провайдера код не
 * уходит, но и не бросает исключение).
 */
export type VerificationCodeSender = (input: {
  phone: string;
  code: string;
}) => void | Promise<void>;

/** Доставка кода по умолчанию — SMS-путь `communityNotifications.sendSms`. */
const defaultCodeSender: VerificationCodeSender = async ({ phone, code }) => {
  await sendSms(phone, `Код подтверждения ХочуТакже: ${code}`);
};

/**
 * Инъектируемый репозиторий аккаунтов. По умолчанию — Drizzle поверх
 * `community_accounts`. Инъекция позволяет юнит-тестам прогонять логику
 * немедленной выдачи прав без реальной БД.
 */
export interface CommunityAccountRepository {
  findByPhone(phone: string): Promise<CommunityAccount | null>;
  /** Создать аккаунт с уже проставленным `phoneVerifiedAt` (R11.1, R11.4). */
  createVerified(phone: string, verifiedAt: Date): Promise<CommunityAccount>;
  /** Проставить `phoneVerifiedAt` существующему аккаунту. */
  markVerified(accountId: number, verifiedAt: Date): Promise<CommunityAccount>;
  /** Привязать Max_Login (опционально). */
  linkMax(accountId: number, maxUserId: string): Promise<CommunityAccount>;
}

/** Репозиторий аккаунтов по умолчанию — Drizzle / `@workspace/db`. */
export const dbCommunityAccountRepository: CommunityAccountRepository = {
  async findByPhone(phone) {
    const [row] = await db
      .select()
      .from(communityAccountsTable)
      .where(eq(communityAccountsTable.phone, phone))
      .limit(1);
    return row ?? null;
  },
  async createVerified(phone, verifiedAt) {
    const [row] = await db
      .insert(communityAccountsTable)
      .values({ phone, phoneVerifiedAt: verifiedAt })
      .returning();
    return row!;
  },
  async markVerified(accountId, verifiedAt) {
    const [row] = await db
      .update(communityAccountsTable)
      .set({ phoneVerifiedAt: verifiedAt })
      .where(eq(communityAccountsTable.id, accountId))
      .returning();
    return row!;
  },
  async linkMax(accountId, maxUserId) {
    const [row] = await db
      .update(communityAccountsTable)
      .set({ maxUserId })
      .where(eq(communityAccountsTable.id, accountId))
      .returning();
    return row!;
  },
};

/** Инъектируемые зависимости Phone_Verification (все — с дефолтами). */
export interface PhoneVerificationDeps {
  /** Хранилище кодов (по умолчанию — модульный in-memory стор). */
  store?: VerificationCodeStore;
  /** Доставка кода (по умолчанию — SMS-путь communityNotifications). */
  sendCode?: VerificationCodeSender;
  /** Репозиторий аккаунтов (по умолчанию — Drizzle). */
  accounts?: CommunityAccountRepository;
  /** Источник времени (для детерминированных тестов истечения). */
  now?: () => number;
  /** Генератор кода (по умолчанию — криптостойкий числовой код). */
  generateCode?: () => string;
  /** TTL кода в мс (по умолчанию `DEFAULT_CODE_TTL_MS`). */
  codeTtlMs?: number;
}

/**
 * Сгенерировать криптостойкий числовой код фиксированной длины (с ведущими
 * нулями). Чистая по входу функция (источник энтропии — `node:crypto`).
 */
export function generateNumericCode(length: number = VERIFICATION_CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += String(randomInt(0, 10));
  }
  return out;
}

/**
 * Детерминированный хеш кода. Открытый код никогда не хранится и не логируется —
 * в стор кладётся только `sha256("${phone}:${code}")`. Привязка к телефону не
 * даёт переиспользовать перехваченный хеш для другого номера.
 */
export function hashVerificationCode(phone: string, code: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

/**
 * Чистый предикат прав публикации (R11.4).
 *
 * Права даются ИСКЛЮЧИТЕЛЬНО по завершённой Phone_Verification. Max_Login сюда
 * не входит: аккаунт без `maxUserId`, но с `phoneVerifiedAt`, имеет полные
 * права; аккаунт с `maxUserId`, но без `phoneVerifiedAt`, прав НЕ имеет.
 *
 * @returns `true`, если у аккаунта проставлен `phoneVerifiedAt`.
 */
export function hasPublishingRights(
  account: Pick<CommunityAccount, "phoneVerifiedAt"> | null | undefined,
): boolean {
  return account != null && account.phoneVerifiedAt != null;
}

/** Причина отказа `requestPhoneCode`. */
export type RequestCodeRejectionReason = "phone_invalid";

/** Результат `requestPhoneCode`. */
export type RequestCodeResult =
  | { ok: true; phone: string; expiresAt: number }
  | { ok: false; reason: RequestCodeRejectionReason };

/**
 * Выпустить и «отправить» одноразовый код подтверждения телефона (R11.1).
 *
 * Сам код в результат НЕ возвращается (только `expiresAt`) — доставка идёт
 * через инъектируемый `sendCode`. В стор кладётся лишь хеш кода.
 *
 * @param rawPhone сырой телефон пользователя
 * @param deps     инъектируемые зависимости (стор/доставка/время/генератор)
 */
export async function requestPhoneCode(
  rawPhone: string,
  deps: PhoneVerificationDeps = {},
): Promise<RequestCodeResult> {
  const phone = normalizeRuPhone(typeof rawPhone === "string" ? rawPhone.trim() : "");
  if (phone === null) {
    return { ok: false, reason: "phone_invalid" };
  }

  const store = deps.store ?? moduleCodeStore;
  const sendCode = deps.sendCode ?? defaultCodeSender;
  const now = deps.now ?? Date.now;
  const generate = deps.generateCode ?? (() => generateNumericCode());
  const ttl = deps.codeTtlMs ?? DEFAULT_CODE_TTL_MS;

  const code = generate();
  const expiresAt = now() + ttl;

  await store.set(phone, {
    codeHash: hashVerificationCode(phone, code),
    expiresAt,
    attempts: 0,
  });

  // Внешняя отправка охраняется инъекцией: тесты перехватывают, прод шлёт SMS.
  await sendCode({ phone, code });

  return { ok: true, phone, expiresAt };
}

/** Причина отказа `confirmPhoneCode`. */
export type ConfirmCodeRejectionReason =
  | "phone_invalid"
  | "code_not_requested"
  | "code_expired"
  | "too_many_attempts"
  | "code_invalid";

/**
 * Результат `confirmPhoneCode`.
 *
 * Успех несёт готовый `Community_Account` с проставленным `phoneVerifiedAt` —
 * `hasPublishingRights(account)` для него истинно немедленно (R11.4).
 */
export type ConfirmCodeResult =
  | { ok: true; account: CommunityAccount }
  | { ok: false; reason: ConfirmCodeRejectionReason };

/**
 * Подтвердить код и завершить Phone_Verification (R11.1, R11.4).
 *
 * При совпадении кода:
 *   - существующий аккаунт получает `phoneVerifiedAt` (если ещё не проставлен);
 *   - иначе создаётся новый аккаунт СРАЗУ с `phoneVerifiedAt`.
 *
 * В обоих случаях права публикации выдаются НЕМЕДЛЕННО, без подключения Max_Bot
 * и без «ожидания отдельного создания учётной записи».
 *
 * @param rawPhone сырой телефон
 * @param code     введённый пользователем код
 * @param deps     инъектируемые зависимости
 */
export async function confirmPhoneCode(
  rawPhone: string,
  code: string,
  deps: PhoneVerificationDeps = {},
): Promise<ConfirmCodeResult> {
  const phone = normalizeRuPhone(typeof rawPhone === "string" ? rawPhone.trim() : "");
  if (phone === null) {
    return { ok: false, reason: "phone_invalid" };
  }

  const store = deps.store ?? moduleCodeStore;
  const accounts = deps.accounts ?? dbCommunityAccountRepository;
  const now = deps.now ?? Date.now;

  const entry = await store.get(phone);
  if (!entry) {
    return { ok: false, reason: "code_not_requested" };
  }

  if (now() > entry.expiresAt) {
    await store.delete(phone);
    return { ok: false, reason: "code_expired" };
  }

  if (entry.attempts >= MAX_CONFIRM_ATTEMPTS) {
    await store.delete(phone);
    return { ok: false, reason: "too_many_attempts" };
  }

  const suppliedHash = hashVerificationCode(phone, typeof code === "string" ? code.trim() : "");
  if (suppliedHash !== entry.codeHash) {
    // Неверная попытка — инкремент счётчика, код остаётся до лимита/истечения.
    await store.set(phone, { ...entry, attempts: entry.attempts + 1 });
    return { ok: false, reason: "code_invalid" };
  }

  // Успех: код израсходован — удаляем из стора.
  await store.delete(phone);

  const verifiedAt = new Date(now());
  const existing = await accounts.findByPhone(phone);

  let account: CommunityAccount;
  if (existing) {
    account = existing.phoneVerifiedAt
      ? existing
      : await accounts.markVerified(existing.id, verifiedAt);
  } else {
    // Немедленное создание уже верифицированного аккаунта (R11.1, R11.4).
    account = await accounts.createVerified(phone, verifiedAt);
  }

  return { ok: true, account };
}

/**
 * Опционально привязать Max_Login к аккаунту (R11.2).
 *
 * Это бонус, а не гейт: функция НЕ меняет `phoneVerifiedAt` и НЕ влияет на
 * `hasPublishingRights`. Публикация никогда не требует вызова этого метода.
 *
 * @param accountId идентификатор Community_Account
 * @param maxUserId идентификатор Max_Login
 * @param deps      инъектируемые зависимости (репозиторий аккаунтов)
 */
export async function linkMaxOptional(
  accountId: number,
  maxUserId: string,
  deps: PhoneVerificationDeps = {},
): Promise<CommunityAccount> {
  const accounts = deps.accounts ?? dbCommunityAccountRepository;
  return accounts.linkMax(accountId, maxUserId);
}

/**
 * Агрегирующий объект сервиса — единая точка для роут-слоя (Task 8.4) и тестов.
 */
export const CommunityAuth = {
  verifyLeadContext,
  normalizeRuPhone,
  requestPhoneCode,
  confirmPhoneCode,
  linkMaxOptional,
  hasPublishingRights,
  generateNumericCode,
  hashVerificationCode,
  createInMemoryCodeStore,
};

export type CommunityAuthApi = typeof CommunityAuth;
