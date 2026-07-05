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
import { hashPassword as defaultHashPassword, verifyPassword as defaultVerifyPassword } from "./auth.js";

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
  /**
   * Создать Community_Account с заданным `password_hash` (форумная регистрация
   * по паролю, Requirement 1.1). `phoneVerifiedAt` не проставляется — права
   * публикации обеспечивает непустой `passwordHash` (R5.1). Вызывающая сторона
   * обязана предварительно нормализовать телефон и проверить его уникальность.
   */
  createWithPassword(phone: string, passwordHash: string): Promise<CommunityAccount>;
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
  async createWithPassword(phone, passwordHash) {
    const [row] = await db
      .insert(communityAccountsTable)
      .values({ phone, passwordHash })
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
 * ═════════════════════════════════════════════════════════════════════════
 * Уровень доступа 3 — форумная регистрация по паролю (community-phone-registration)
 * Requirements 1, 2, 3, 5, 6.
 *
 * SMS-путь (`requestPhoneCode` / `confirmPhoneCode`) выше сохраняется, но
 * перестаёт быть единственным путём получения прав публикации. Ниже —
 * доменные хелперы password-регистрации: Password_Policy (`validatePassword`),
 * единственная публичная сериализация аккаунта без `password_hash`
 * (`toPublicAccount`) и обобщённый предикат прав (`hasPublishingRights`).
 * ═════════════════════════════════════════════════════════════════════════
 */

/**
 * Password_Policy: минимальная длина Password — 8 символов включительно
 * (Requirement 2.2).
 */
export const PASSWORD_MIN_LENGTH = 8;
/**
 * Password_Policy: максимальная длина Password — 72 символа включительно
 * (Requirement 2.2). Верхняя граница bcrypt (значимые байты пароля).
 */
export const PASSWORD_MAX_LENGTH = 72;

/**
 * Результат проверки Password_Policy — дискриминированное объединение по `ok`.
 *
 * - `password_missing` — обязательное поле отсутствует или пусто (Requirement 2.3).
 * - `password_invalid` — длина вне диапазона 8..72 включительно (Requirement 2.2).
 */
export type PasswordValidation =
  | { ok: true }
  | { ok: false; reason: "password_missing" | "password_invalid" };

/**
 * Чистая проверка Password_Policy (Requirement 2.2, 2.3).
 *
 * Различает «отсутствует обязательное поле» (не строка либо пустая строка) и
 * «недопустимый пароль» (длина строки меньше {@link PASSWORD_MIN_LENGTH} или
 * больше {@link PASSWORD_MAX_LENGTH}). Пароль не тримится: длина считается по
 * исходной строке, чтобы пробелы были значимыми символами пароля.
 *
 * @param raw сырой ввод пароля (тип неизвестен — приходит из тела запроса)
 */
export function validatePassword(raw: unknown): PasswordValidation {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, reason: "password_missing" };
  }
  if (raw.length < PASSWORD_MIN_LENGTH || raw.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, reason: "password_invalid" };
  }
  return { ok: true };
}

/**
 * Публичный DTO Community_Account: гарантированно БЕЗ `password_hash`
 * (Requirement 1.4, 3.2, 4.4, 6.2).
 *
 * Поле `hasPublishingRights` вычисляется из состояния аккаунта, чтобы
 * вызывающая сторона не пересчитывала предикат самостоятельно.
 */
export interface PublicCommunityAccount {
  id: number;
  phone: string;
  role: string;
  zhkId: number | null;
  maxUserId: string | null;
  phoneVerifiedAt: Date | null;
  hasPublishingRights: boolean;
  createdAt: Date;
}

/**
 * Спроецировать Community_Account в публичный DTO — ЕДИНСТВЕННЫЙ способ
 * сериализовать аккаунт в HTTP-ответ (Requirement 1.4, 3.2, 4.4, 6.2).
 *
 * Поля перечисляются явно (allow-list), поэтому `password_hash` не может
 * попасть в ответ даже при будущем расширении схемы аккаунта.
 */
export function toPublicAccount(account: CommunityAccount): PublicCommunityAccount {
  return {
    id: account.id,
    phone: account.phone,
    role: account.role,
    zhkId: account.zhkId,
    maxUserId: account.maxUserId,
    phoneVerifiedAt: account.phoneVerifiedAt,
    hasPublishingRights: hasPublishingRights(account),
    createdAt: account.createdAt,
  };
}

/**
 * ОБОБЩЁННЫЙ предикат прав публикации (Requirement 5.1, 5.2, 5.3, 5.6).
 *
 * Права даются, если задан непустой `passwordHash` (зарегистрированный аккаунт,
 * R5.1) ИЛИ проставлен `phoneVerifiedAt` (Legacy_Verified_Account — обратная
 * совместимость с SMS-путём, R5.2). Если оба признака отсутствуют/пусты —
 * прав нет (R5.3). Max_Login (`maxUserId`) в предикат НЕ входит и не может быть
 * условием прав (R5.6): результат не зависит от `maxUserId`.
 *
 * @returns `true`, если у аккаунта непустой `passwordHash` ИЛИ задан `phoneVerifiedAt`.
 */
export function hasPublishingRights(
  account: Pick<CommunityAccount, "phoneVerifiedAt" | "passwordHash"> | null | undefined,
): boolean {
  if (account == null) return false;
  const hasPassword =
    typeof account.passwordHash === "string" && account.passwordHash.length > 0;
  return hasPassword || account.phoneVerifiedAt != null;
}

/**
 * Инъектируемые зависимости password-регистрации и входа (Requirements 1, 3, 6).
 *
 * Все поля опциональны — при отсутствии применяются продовые дефолты
 * ({@link communityAuthDefaults}): Drizzle-репозиторий поверх
 * `community_accounts`, серверная проверка SmartCaptcha (`verifyCaptchaToken`)
 * и bcryptjs-хелперы из `lib/auth.ts` (`hashPassword` cost=10 / `verifyPassword`).
 * Инъекция позволяет юнит- и property-тестам прогонять `registerAccount` /
 * `loginAccount` без реальной БД, сети и медленного bcrypt.
 */
export interface CommunityAuthDeps {
  /** Репозиторий аккаунтов (по умолчанию — Drizzle / `@workspace/db`). */
  accounts?: CommunityAccountRepository;
  /** Серверная проверка Captcha (по умолчанию — `verifyCaptchaToken`). */
  verifyCaptcha?: CaptchaVerifier;
  /** Хеширование пароля bcryptjs cost≥10 (по умолчанию — `lib/auth.hashPassword`). */
  hashPassword?: (password: string) => Promise<string>;
  /** Проверка пароля bcryptjs (по умолчанию — `lib/auth.verifyPassword`). */
  verifyPassword?: (password: string, hash: string) => Promise<boolean>;
  /** Источник времени (для детерминированных тестов). */
  now?: () => number;
}

/**
 * Продовые дефолты {@link CommunityAuthDeps} — единый источник истины для
 * `registerAccount` / `loginAccount`. Реиспользует существующие компоненты:
 * `verifyCaptchaToken` (через {@link defaultCaptchaVerifier}) и bcryptjs-хелперы
 * из `lib/auth.ts`.
 */
export const communityAuthDefaults: Required<CommunityAuthDeps> = {
  accounts: dbCommunityAccountRepository,
  verifyCaptcha: defaultCaptchaVerifier,
  hashPassword: defaultHashPassword,
  verifyPassword: defaultVerifyPassword,
  now: Date.now,
};

/**
 * Причина отказа регистрации Community_Account (Requirement 2).
 *
 * - `phone_missing` / `password_missing` — обязательное поле отсутствует или
 *   пусто (Requirement 2.3).
 * - `phone_invalid` — телефон не приводится к Normalized_Phone (Requirement 2.1).
 * - `password_invalid` — длина Password вне 8..72 включительно (Requirement 2.2).
 * - `phone_taken` — Normalized_Phone уже присутствует в `community_accounts`
 *   (Requirement 2.4).
 * - `captcha_missing` — Captcha-токен отсутствует/пуст; серверная проверка НЕ
 *   выполняется (Requirement 2.5).
 * - `captcha_failed` — Captcha-токен передан, но не прошёл проверку
 *   (Requirement 2.6).
 * - `captcha_unavailable` — серверная проверка Captcha не может быть выполнена
 *   (сервис недоступен / таймаут); fail-closed (Requirement 2.7).
 */
export type RegisterRejectionReason =
  | "phone_missing"
  | "phone_invalid"
  | "password_missing"
  | "password_invalid"
  | "phone_taken"
  | "captcha_missing"
  | "captcha_failed"
  | "captcha_unavailable";

/**
 * Результат `registerAccount` — дискриминированное объединение по `ok`.
 *
 * - Успех: `{ ok: true, account }` — созданный Community_Account (сериализуется
 *   в HTTP-ответ ТОЛЬКО через {@link toPublicAccount}, без `password_hash`).
 * - Отказ: `{ ok: false, reason, retry }` — `retry: true` означает, что
 *   пользователю следует предложить повторить проверку Captcha (Requirement
 *   2.5, 2.6, 2.7). При любом отказе аккаунт не создаётся (Requirement 2.8).
 */
export type RegisterResult =
  | { ok: true; account: CommunityAccount }
  | { ok: false; reason: RegisterRejectionReason; retry: boolean };

/** Вход `registerAccount`: телефон, пароль, Captcha-токен и best-effort IP. */
export interface RegisterInput {
  /** Сырой телефон, как введён пользователем (любой человекочитаемый формат). */
  phone: string;
  /** Сырой Password пользователя (значимые символы не тримятся). */
  password: string;
  /** Одноразовый токен SmartCaptcha (`smart-token`) с формы регистрации. */
  captchaToken: string;
  /** IP клиента (best-effort) — прокидывается в SmartCaptcha как `ip`. */
  remoteIp?: string | null;
}

/**
 * Зарегистрировать Community_Account по телефону и паролю (Requirements 1, 2, 6).
 *
 * Порядок проверок строго фиксирован (см. sequence diagram в design.md):
 *   1. Обязательные поля: телефон и Password непусты (Requirement 2.3).
 *   2. `normalizeRuPhone` — иначе `phone_invalid` (Requirement 2.1, 1.5).
 *   3. `validatePassword` — иначе `password_missing` / `password_invalid`
 *      (Requirement 2.2, 2.3).
 *   4. Captcha: при пустом токене — `captcha_missing` БЕЗ вызова верификатора
 *      (Requirement 2.5). Иначе серверная проверка: отказ → `captcha_failed`
 *      (Requirement 2.6); брошенное исключение/недоступность (fail-closed) →
 *      `captcha_unavailable` (Requirement 2.7). Все три — с `retry: true`.
 *   5. Уникальность Normalized_Phone — иначе `phone_taken` (Requirement 2.4).
 *   6. `hashPassword` (bcryptjs cost ≥ 10, Requirement 6.1) → `createWithPassword`
 *      (INSERT). Password сохраняется ТОЛЬКО как Password_Hash (Requirement 1.2).
 *
 * При ЛЮБОМ отказе аккаунт не создаётся и состояние не мутируется (Requirement
 * 2.8). Успешно созданный аккаунт немедленно обладает Publishing_Rights
 * (Requirement 1.6) — его `passwordHash` непуст (см. {@link hasPublishingRights}).
 *
 * Установка Community_Session (Requirement 1.3) выполняется НЕ здесь, а в
 * роут-слое после успешного результата — доменная функция чиста относительно
 * HTTP/сессии.
 *
 * @param input входные данные регистрации
 * @param deps  инъектируемые зависимости (по умолчанию — {@link communityAuthDefaults})
 */
export async function registerAccount(
  input: RegisterInput,
  deps: CommunityAuthDeps = {},
): Promise<RegisterResult> {
  const accounts = deps.accounts ?? communityAuthDefaults.accounts;
  const verifyCaptcha = deps.verifyCaptcha ?? communityAuthDefaults.verifyCaptcha;
  const hashPassword = deps.hashPassword ?? communityAuthDefaults.hashPassword;

  // 1) Обязательные поля: телефон непуст (Requirement 2.3).
  const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (rawPhone.length === 0) {
    return { ok: false, reason: "phone_missing", retry: false };
  }

  // Password не тримится: длина считается по исходной строке. Пустой/не-строка
  // → phone/password_missing ниже через validatePassword; но сперва проверяем
  // само наличие поля пароля (Requirement 2.3).
  const rawPassword = typeof input.password === "string" ? input.password : "";
  if (rawPassword.length === 0) {
    return { ok: false, reason: "password_missing", retry: false };
  }

  // 2) Нормализация телефона до всех дальнейших проверок (Requirement 1.5, 2.1).
  const phone = normalizeRuPhone(rawPhone);
  if (phone === null) {
    return { ok: false, reason: "phone_invalid", retry: false };
  }

  // 3) Password_Policy (Requirement 2.2, 2.3).
  const passwordCheck = validatePassword(rawPassword);
  if (!passwordCheck.ok) {
    return { ok: false, reason: passwordCheck.reason, retry: false };
  }

  // 4) Captcha. Пустой токен — незаполненная форма: отклоняем БЕЗ сетевого
  //    вызова и предлагаем повторить (Requirement 2.5).
  const token = typeof input.captchaToken === "string" ? input.captchaToken.trim() : "";
  if (token.length === 0) {
    return { ok: false, reason: "captcha_missing", retry: true };
  }

  // Серверная проверка Captcha инъектируется как fail-closed: недоступность
  // сервиса (брошенное исключение) даёт `captcha_unavailable`, а не пропуск
  // проверки (Requirement 2.7).
  let captcha: { success: boolean };
  try {
    captcha = await verifyCaptcha({ token, remoteIp: input.remoteIp ?? null });
  } catch {
    return { ok: false, reason: "captcha_unavailable", retry: true };
  }
  if (!captcha.success) {
    return { ok: false, reason: "captcha_failed", retry: true };
  }

  // 5) Уникальность Normalized_Phone (Requirement 2.4).
  const existing = await accounts.findByPhone(phone);
  if (existing) {
    return { ok: false, reason: "phone_taken", retry: false };
  }

  // 6) Хеширование и создание. Password сохраняется ТОЛЬКО как Password_Hash
  //    (Requirement 1.2, 6.1). Открытый пароль в БД не попадает.
  const passwordHash = await hashPassword(rawPassword);
  const account = await accounts.createWithPassword(phone, passwordHash);

  return { ok: true, account };
}

/**
 * Результат `loginAccount` — дискриминированное объединение по `ok`.
 *
 * Отказ ЕДИНЫЙ и структурно идентичный для всех причин (ненормализуемый
 * телефон, неизвестный телефон, отсутствующий Password_Hash, неверный пароль):
 * `{ ok: false }` без поля причины — так, чтобы вызывающая сторона не могла
 * определить, какой именно фактор не совпал (Requirement 3.7). Успех несёт
 * `Community_Account`, сериализуемый в HTTP-ответ ТОЛЬКО через
 * {@link toPublicAccount} (без `password_hash`, Requirement 3.2).
 */
export type LoginResult =
  | { ok: true; account: CommunityAccount }
  | { ok: false };

/** Вход `loginAccount`: телефон-логин и предъявляемый Password. */
export interface LoginInput {
  /** Сырой телефон-логин, как введён пользователем (любой формат). */
  phone: string;
  /** Сырой Password пользователя (значимые символы не тримятся). */
  password: string;
}

/**
 * Аутентифицировать Community_Account по телефону и паролю (Requirements 3, 6.3, 6.4).
 *
 * Порядок проверок:
 *   1. `normalizeRuPhone` — ненормализуемый телефон → единый отказ (Requirement 3.3).
 *   2. `findByPhone(normalized)` — неизвестный телефон → единый отказ (Requirement 3.4).
 *   3. Непустой `passwordHash` — отсутствует/пуст → единый отказ (Requirement 3.6).
 *   4. `verifyPassword(password, passwordHash)` (bcryptjs) — несовпадение →
 *      единый отказ (Requirement 3.5). Сравнение выполняется ТОЛЬКО с хешем;
 *      открытый Password с хранимым значением не сравнивается (Requirement 6.3).
 *
 * Во всех отказных ветвях возвращается структурно идентичный `{ ok: false }`
 * без раскрытия несовпавшего фактора (Requirement 3.7). Хранимый Password_Hash
 * ни в одной ветви не мутируется — функция только читает аккаунт (Requirement
 * 6.4). Установка Community_Session (Requirement 3.1) выполняется НЕ здесь, а в
 * роут-слое после успешного результата: доменная функция чиста относительно
 * HTTP/сессии.
 *
 * @param input входные данные входа
 * @param deps  инъектируемые зависимости (по умолчанию — {@link communityAuthDefaults})
 */
export async function loginAccount(
  input: LoginInput,
  deps: CommunityAuthDeps = {},
): Promise<LoginResult> {
  const accounts = deps.accounts ?? communityAuthDefaults.accounts;
  const verifyPassword = deps.verifyPassword ?? communityAuthDefaults.verifyPassword;

  // 1) Нормализация телефона-логина (Requirement 3.3). Единый отказ.
  const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
  const phone = normalizeRuPhone(rawPhone);
  if (phone === null) {
    return { ok: false };
  }

  // 2) Поиск аккаунта по Normalized_Phone (Requirement 3.4). Единый отказ.
  const account = await accounts.findByPhone(phone);
  if (!account) {
    return { ok: false };
  }

  // 3) Непустой Password_Hash обязателен (Requirement 3.6). Единый отказ.
  const passwordHash =
    typeof account.passwordHash === "string" ? account.passwordHash : "";
  if (passwordHash.length === 0) {
    return { ok: false };
  }

  // 4) Проверка пароля bcryptjs — только против хеша (Requirement 3.5, 6.3).
  //    Password_Hash при этом не мутируется (Requirement 6.4).
  const rawPassword = typeof input.password === "string" ? input.password : "";
  const matches = await verifyPassword(rawPassword, passwordHash);
  if (!matches) {
    return { ok: false };
  }

  return { ok: true, account };
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
  validatePassword,
  toPublicAccount,
  registerAccount,
  loginAccount,
  generateNumericCode,
  hashVerificationCode,
  createInMemoryCodeStore,
};

export type CommunityAuthApi = typeof CommunityAuth;
