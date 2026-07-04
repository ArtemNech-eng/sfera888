/**
 * Moderation_Service — content screening for community feeds
 * (Sosedi_Zone / PRO_Zone).
 *
 * Scope of this module (Task 7.1):
 *   - `screen(post)` → returns a {@link ModerationVerdict} classifying the
 *     content as `allow` / `restrict_to_protected` / `unpublish` / `block_spam`.
 *   - Pure, unit-testable detection helpers used by `screen`:
 *       • {@link containsObscenity} — profanity via the `obscenity` package
 *         (English dataset) + a compact Russian stem wordlist.
 *       • {@link containsPii}       — personal data (phones, emails, passport,
 *         SNILS, INN).
 *       • {@link containsDefamation}— defamatory statements about named persons.
 *       • {@link isSpam}            — spam heuristic (links + promo + repetition).
 *
 * Design grounding — Requirements 19.1, 19.2, 19.5:
 *   - 19.1: Publication is possible WITHOUT moderation. `screen` only *returns*
 *     a verdict; it is NOT a mandatory visibility gate. Callers decide whether
 *     and when to apply the verdict (post-hoc / async policy).
 *   - 19.2: Content with personal data or defamation about named persons has
 *     its public visibility restricted — moved to PRO_Protected_Layer where a
 *     protected layer exists, otherwise unpublished.
 *   - 19.5: Content classified as spam is blocked from publication.
 *
 * NOTE: zone-boundary enforcement (advert-in-Sosedi), the moderation queue and
 * the action log are implemented in the second half of this module (Task 7.2):
 * {@link enforceZoneBoundary} / {@link flagForReview} / {@link logAction}. The
 * pure screening logic above (Task 7.1) has no side effects; the Task 7.2 layer
 * below performs the effectful moderation actions (DB writes + notification).
 */

import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from "obscenity";
import { eq } from "drizzle-orm";
import {
  db,
  communityThreadsTable,
  communityModerationLogTable,
  type CommunityModerationLog,
} from "@workspace/db";
import { isMasterAdInSosedi } from "./zoneService.js";
import { notify } from "./communityNotifications.js";

// ─── Public types ─────────────────────────────────────────────────────────

/** Community zone discriminator (mirrors `community_threads.zone`). */
export type CommunityZone = "sosedi" | "pro_public" | "pro_protected";

/**
 * Verdict actions:
 *   - `allow`                 — no issues detected; content may stay public.
 *   - `restrict_to_protected` — move to PRO_Protected_Layer (limit visibility).
 *   - `unpublish`             — remove from public visibility (no protected
 *                               layer available, e.g. Sosedi_Zone).
 *   - `block_spam`            — spam; block publication (Requirement 19.5).
 */
export type ModerationAction =
  | "allow"
  | "restrict_to_protected"
  | "unpublish"
  | "block_spam";

export interface ModerationVerdict {
  action: ModerationAction;
  /** Machine/human hint describing why the action was chosen. Optional. */
  reason?: string;
}

/**
 * Minimal structural shape screened by {@link screen}. Intentionally narrow so
 * this module does NOT depend on `@workspace/db`: callers may pass a Drizzle
 * row or any plain object with the same fields.
 */
export interface ScreenablePost {
  title?: string | null;
  body?: string | null;
  /**
   * Zone the content lives in. Determines whether restricted content can be
   * moved to a protected layer (PRO_*) or must be unpublished (Sosedi has no
   * protected layer). When omitted, `restrict_to_protected` is preferred.
   */
  zone?: CommunityZone;
  category?: string | null;
}

// ─── Obscenity matcher (English dataset, built once) ────────────────────────

const englishProfanityMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// Compact Russian profanity stem list. Each regex matches the stem plus
// arbitrary suffixes so declensions are covered. Kept intentionally small to
// avoid false positives on legitimate words.
const RUSSIAN_PROFANITY_STEMS: readonly RegExp[] = [
  /бля[дт]?\w*/iu,
  /сук[аиеуо]\w*/iu,
  /пид[оа]р\w*/iu,
  /ху[йеё]\w*/iu,
  /пизд\w*/iu,
  /[еёэ]бан\w*/iu,
  /[еёэ]бат\w*/iu,
  /мудак\w*/iu,
  /долбо[её]б\w*/iu,
  /гандон\w*/iu,
];

// Latin look-alikes spammers use to smuggle cyrillic profanity past filters.
const LATIN_TO_CYRILLIC: Record<string, string> = {
  a: "а", c: "с", e: "е", o: "о", p: "р", x: "х", y: "у",
  A: "а", C: "с", E: "е", O: "о", P: "р", X: "х", Y: "у",
};

function normalizeLookalikes(text: string): string {
  let out = "";
  for (const ch of text) out += LATIN_TO_CYRILLIC[ch] ?? ch;
  return out;
}

/**
 * `true` when the text contains profanity (English via `obscenity`, Russian via
 * the stem list). Pure.
 */
export function containsObscenity(text: string): boolean {
  if (!text) return false;
  if (englishProfanityMatcher.hasMatch(text)) return true;
  const normalized = normalizeLookalikes(text);
  return RUSSIAN_PROFANITY_STEMS.some(
    (re) => re.test(text) || re.test(normalized),
  );
}

// ─── Personal-data (PII) detection ──────────────────────────────────────────

// Russian mobile / landline with optional +7/8 prefix and common separators.
const PHONE_RE =
  /(?:\+?[78][\s\-(]*)?\(?\d{3}\)?[\s\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// RF passport: 4 digits (series) + 6 digits (number), optional space.
const PASSPORT_RE = /\bпаспорт\w*\s*:?\s*\d{4}\s?\d{6}\b/iu;
const PASSPORT_BARE_RE = /\b\d{4}\s\d{6}\b/;
// SNILS: 3-3-3 space 2.
const SNILS_RE = /\b\d{3}-\d{3}-\d{3}\s?\d{2}\b/;
// Individual taxpayer number (INN): 10 or 12 digits, usually labelled.
const INN_RE = /\bинн\w*\s*:?\s*\d{10}(?:\d{2})?\b/iu;

/**
 * `true` when the text exposes personal data: phone, email, passport, SNILS or
 * a labelled INN. Pure. (Requirement 19.2)
 */
export function containsPii(text: string): boolean {
  if (!text) return false;
  return (
    PHONE_RE.test(text) ||
    EMAIL_RE.test(text) ||
    PASSPORT_RE.test(text) ||
    PASSPORT_BARE_RE.test(text) ||
    SNILS_RE.test(text) ||
    INN_RE.test(text)
  );
}

// ─── Defamation detection ─────────────────────────────────────────────────

// Accusatory / defamatory stems typically levelled at a *named* person.
const DEFAMATION_STEMS: readonly RegExp[] = [
  /мошенник\w*/iu,
  /афери?ст\w*/iu,
  /кидал\w*/iu,
  /кид(?:ает|ают|ал|ают|нул)\w*/iu,
  /обман(?:ул|ыва|щик)\w*/iu,
  /ворю?г\w*/iu,
  /вор(?:ует|уют)\w*/iu,
  /жули?к\w*/iu,
  /шарлатан\w*/iu,
  /развод(?:ит|ила|няк)\w*/iu,
  /не\s+запла(?:тил|тит|тят)\w*/iu,
  /не\s+плат(?:ит|ят)\w*/iu,
];

// A capitalized token (≥3 letters) is treated as a possible person /
// organisation name. `\p{Lu}` = uppercase letter, `\p{Ll}` = lowercase
// (unicode-aware). Note: JS `\b` is ASCII-only and does NOT match a boundary
// before a cyrillic letter, so we intentionally omit word boundaries here.
const PROPER_NOUN_RE = /\p{Lu}\p{Ll}{2,}/u;

/**
 * `true` when the text makes an accusatory statement AND references a named
 * subject (capitalized proper noun). Requiring both signals keeps the heuristic
 * conservative and avoids flagging generic complaints. Pure. (Requirement 19.2)
 */
export function containsDefamation(text: string): boolean {
  if (!text) return false;
  const hasAccusation = DEFAMATION_STEMS.some((re) => re.test(text));
  if (!hasAccusation) return false;
  return PROPER_NOUN_RE.test(text);
}

// ─── Spam heuristic ─────────────────────────────────────────────────────────

const URL_RE =
  /(https?:\/\/|www\.[a-z0-9-]|t\.me\/|wa\.me\/|vk\.com\/|\b[a-z0-9-]+\.(?:ru|com|net|org|рф)\b)/gi;

// Promotional vocabulary common to service adverts / spam.
const PROMO_STEMS: readonly RegExp[] = [
  /скидк\w*/iu,
  /акци[яйи]\w*/iu,
  /распродаж\w*/iu,
  /промокод\w*/iu,
  /бесплатн\w*/iu,
  /закаж(?:и|ите)\w*/iu,
  /куп(?:и|ите)\b/iu,
  /звони(?:те)?\b/iu,
  /перейд(?:и|ите)\s+по\s+ссылк\w*/iu,
  /гарант(?:ия|ируем)\w*/iu,
  /дёшев\w*|дешев\w*/iu,
  /вырабо(?:ток|тайте)|зарабо(?:ток|тайте)\w*/iu,
];

function countUrls(text: string): number {
  const matches = text.match(URL_RE);
  return matches ? matches.length : 0;
}

function countPromoHits(text: string): number {
  let hits = 0;
  for (const re of PROMO_STEMS) if (re.test(text)) hits++;
  return hits;
}

/** Longest run of a single repeated character (defends against "аааааа…"). */
function longestCharRun(text: string): number {
  let best = 0;
  let run = 0;
  let prev = "";
  for (const ch of text) {
    if (ch === prev && !/\s/.test(ch)) {
      run++;
    } else {
      run = 1;
      prev = ch;
    }
    if (run > best) best = run;
  }
  return best;
}

function capsRatio(text: string): number {
  const upper = (text.match(/[A-ZА-ЯЁ]/g) ?? []).length;
  const lower = (text.match(/[a-zа-яё]/g) ?? []).length;
  const total = upper + lower;
  return total === 0 ? 0 : upper / total;
}

/**
 * Spam heuristic (Requirement 19.5). Combines several weak signals:
 *   - links (2+ links, or a link together with promo/phone),
 *   - promotional vocabulary,
 *   - phone contact in a promotional context,
 *   - obscenity,
 *   - excessive character repetition,
 *   - excessive capitalisation on longer text.
 *
 * Hard rules trip immediately; otherwise a weighted score ≥ 3 → spam. Pure.
 */
export function isSpam(text: string): boolean {
  if (!text) return false;
  const urls = countUrls(text);
  const promo = countPromoHits(text);
  const hasPhone = PHONE_RE.test(text);

  // ── Hard rules ──
  if (urls >= 3) return true;
  if (promo >= 1 && (urls >= 1 || hasPhone)) return true;
  if (longestCharRun(text) >= 15) return true;

  // ── Weighted score ──
  let score = 0;
  if (urls >= 2) score += 2;
  else if (urls === 1) score += 1;
  score += Math.min(promo, 2); // promo alone is capped so it can't self-trip
  if (hasPhone) score += 1;
  if (containsObscenity(text)) score += 1;
  if (text.length > 30 && capsRatio(text) > 0.6) score += 1;

  return score >= 3;
}

// ─── Verdict ─────────────────────────────────────────────────────────────

function combineText(post: ScreenablePost): string {
  return [post.title ?? "", post.body ?? ""].join("\n").trim();
}

/**
 * Restricted content (PII / defamation) either moves to the protected PRO
 * layer or is unpublished. Sosedi_Zone has no protected layer, so restricted
 * content there is unpublished. (Requirement 19.2)
 */
function restrictVerdict(
  zone: CommunityZone | undefined,
  reason: string,
): ModerationVerdict {
  if (zone === "sosedi") return { action: "unpublish", reason };
  return { action: "restrict_to_protected", reason };
}

/**
 * Screen a community post and return a {@link ModerationVerdict}.
 *
 * IMPORTANT (Requirement 19.1): this function does NOT publish, hide or block
 * anything and is NOT a mandatory gate for public visibility. It is a pure
 * classifier — the caller decides whether/when to apply the verdict. Content
 * can be published without ever being screened.
 *
 * Precedence: spam (hard block) → PII/defamation (restrict) → allow.
 */
export function screen(post: ScreenablePost): ModerationVerdict {
  const text = combineText(post);
  if (!text) return { action: "allow" };

  // Requirement 19.5 — spam is a hard block and takes precedence.
  if (isSpam(text)) {
    return { action: "block_spam", reason: "spam" };
  }

  // Requirement 19.2 — personal data / defamation restrict public visibility.
  const pii = containsPii(text);
  const defamation = containsDefamation(text);
  if (pii || defamation) {
    const reason =
      pii && defamation
        ? "personal_data_and_defamation"
        : pii
          ? "personal_data"
          : "defamation";
    return restrictVerdict(post.zone, reason);
  }

  return { action: "allow" };
}

// ════════════════════════════════════════════════════════════════════════════
//  Task 7.2 — Границы зон, очередь модерации и журнал действий
//  (Requirements 8.2, 19.3, 19.4)
//
//  ЗАМЕЧАНИЕ ПО СХЕМЕ (адаптация к существующей БД):
//    Отдельной таблицы `moderation_queue` в `@workspace/db` НЕТ — задача 1
//    материализовала только журнал `community_moderation_log`
//    (`communityModerationLogTable`) и поля `moderation_status` / `visibility`
//    в `community_threads`. Поэтому «очередь модерации» представлена НЕ
//    отдельной таблицей, а комбинацией:
//      • `community_threads.moderation_status = 'queued'` — маркер нахождения
//        темы в очереди на рассмотрение (Requirement 19.3);
//      • запись в `community_moderation_log` с `action = 'queue'` — аудит
//        постановки в очередь (Requirement 19.4).
//    Миграция здесь НЕ добавляется (по условию задачи) — адаптируемся к схеме.
// ════════════════════════════════════════════════════════════════════════════

/** Тип цели модерационного действия (обобщённая ссылка журнала). */
export type ModerationTargetType = "thread" | "account";

/**
 * Запись журнала модерации (вход {@link logAction}). Совместима с колонками
 * `community_moderation_log`. `moderatorId = null` означает автоматическое
 * действие (Requirement 19.4).
 */
export interface ModerationLogEntry {
  targetType: ModerationTargetType;
  targetId: number;
  /** `block` | `hide` | `move_protected` | `queue` (см. дизайн). */
  action: string;
  reason?: string | null;
  /** `null`/`undefined` = автоматическое действие. */
  moderatorId?: number | null;
}

/**
 * Минимальная форма темы для проверки границы зон. Совместима с Drizzle-строкой
 * `CommunityThread`, но требует лишь текстовые поля, зону, id и автора — так
 * решение остаётся unit-тестируемым без полной строки БД.
 */
export interface ZoneBoundaryPost {
  /** id темы, если она уже персистирована (для блокировки/журнала). */
  id?: number | null;
  zone: string;
  title?: string | null;
  body?: string | null;
  category?: string | null;
  /** Автор темы (для журнала/уведомления). */
  authorAccountId?: number | null;
}

/** Минимальная форма аккаунта-автора (роль + контакты для уведомления). */
export interface ZoneBoundaryAccount {
  id?: number | null;
  role?: string | null;
  /** Телефон автора — канал Web_Push/SMS уведомления (Requirement 8.2). */
  phone?: string | null;
  /** Max_Login id — при наличии уведомление уходит через Max. */
  maxUserId?: string | number | null;
}

/** Результат {@link enforceZoneBoundary}. */
export interface EnforceZoneBoundaryResult {
  /** Публикация заблокирована (реклама мастера в зоне соседей). */
  blocked: boolean;
  /**
   * Автор уведомлён о нарушении границы зон. Всегда `false`, если `blocked`
   * тоже `false` — уведомление возможно ТОЛЬКО при успешной блокировке
   * (Requirement 8.2).
   */
  notified: boolean;
}

/**
 * Инъекция зависимостей для {@link enforceZoneBoundary}. Позволяет unit-тестам
 * проверять чистую логику решения (детект → блок → уведомление) без обращения
 * к БД и внешним каналам. По умолчанию используются реальные реализации.
 */
export interface EnforceZoneBoundaryDeps {
  /** Детект нарушения (по умолчанию — {@link isMasterAdInSosedi}). */
  detect?: (post: ZoneBoundaryPost, account: ZoneBoundaryAccount | null) => boolean;
  /** Выполнить блокировку; вернуть `true` при успехе. По умолчанию — DB + журнал. */
  block?: (post: ZoneBoundaryPost, account: ZoneBoundaryAccount | null) => Promise<boolean>;
  /** Уведомить автора; вернуть `true` при доставке. По умолчанию — {@link notify}. */
  notifyAuthor?: (
    post: ZoneBoundaryPost,
    account: ZoneBoundaryAccount | null,
  ) => Promise<boolean>;
}

/**
 * Блокировка по умолчанию: скрыть тему (если персистирована) и записать
 * действие `block` в журнал. `moderatorId = null` — автоматическое действие
 * (Requirement 19.4). Возвращает `true` при успешном выполнении.
 */
async function defaultBlock(
  post: ZoneBoundaryPost,
  _account: ZoneBoundaryAccount | null,
): Promise<boolean> {
  if (post.id != null) {
    await db
      .update(communityThreadsTable)
      .set({ visibility: "hidden", moderationStatus: "blocked" })
      .where(eq(communityThreadsTable.id, post.id));
  }
  await logAction({
    targetType: "thread",
    targetId: post.id ?? 0,
    action: "block",
    reason: "zone_boundary_master_ad",
    moderatorId: null, // авто-действие
  });
  return true;
}

/**
 * Уведомление автора по умолчанию: каскад каналов через {@link notify}
 * (Max → Web_Push → SMS). Помечено как важное, чтобы у автора без Max ушло SMS.
 * Никогда не бросает — `notify` уже guarded (Requirement 15.4). Возвращает
 * фактический флаг доставки.
 */
async function defaultNotifyAuthor(
  _post: ZoneBoundaryPost,
  account: ZoneBoundaryAccount | null,
): Promise<boolean> {
  if (!account?.phone) return false;
  const result = await notify(
    { phone: account.phone, maxUserId: account.maxUserId ?? null },
    {
      title: "Публикация отклонена",
      body:
        "Рекламное предложение услуг мастера нельзя размещать в зоне соседей. " +
        "Опубликуйте его в профессиональной зоне «Хочу также ПРО».",
      important: true,
    },
  );
  return result.delivered;
}

/**
 * Обеспечить границу зон: заблокировать рекламное предложение услуг мастера,
 * размещаемое в зоне соседей, и — ТОЛЬКО при успешной блокировке — уведомить
 * автора о нарушении границы зон (Requirement 8.2).
 *
 * Порядок:
 *   1. Детект нарушения ({@link isMasterAdInSosedi}, чистая функция). Нет
 *      нарушения → `{ blocked: false, notified: false }`, побочных эффектов нет.
 *   2. Попытка блокировки. Любой сбой блокировки НЕ пробрасывается наружу и
 *      трактуется как неуспешная блокировка (`blocked = false`).
 *   3. Уведомление автора выполняется ИСКЛЮЧИТЕЛЬНО когда блокировка удалась;
 *      сбой уведомления guarded и не влияет на факт блокировки.
 *
 * @returns `{ blocked, notified }`. Инвариант: `notified` может быть `true`
 *          только если `blocked === true` (Requirement 8.2).
 */
export async function enforceZoneBoundary(
  post: ZoneBoundaryPost,
  account?: ZoneBoundaryAccount | null,
  deps: EnforceZoneBoundaryDeps = {},
): Promise<EnforceZoneBoundaryResult> {
  const acc = account ?? null;
  const detect = deps.detect ?? ((p, a) => isMasterAdInSosedi(p, a ?? undefined));

  // 1. Детект нарушения границы зон (Requirement 8.2, detection-часть).
  if (!detect(post, acc)) {
    return { blocked: false, notified: false };
  }

  // 2. Блокировка. Сбой блокировки не должен ломать вызывающий поток.
  const block = deps.block ?? defaultBlock;
  let blocked = false;
  try {
    blocked = await block(post, acc);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[moderationService] enforceZoneBoundary: блокировка не удалась: ${message}`);
    blocked = false;
  }

  // Уведомление возможно ТОЛЬКО при успешной блокировке (Requirement 8.2).
  if (!blocked) {
    return { blocked: false, notified: false };
  }

  // 3. Уведомить автора о нарушении границы (guarded, никогда не бросает).
  const notifyAuthor = deps.notifyAuthor ?? defaultNotifyAuthor;
  let notified = false;
  try {
    notified = await notifyAuthor(post, acc);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[moderationService] enforceZoneBoundary: уведомление автора не удалось: ${message}`);
    notified = false;
  }

  return { blocked: true, notified };
}

/**
 * Поставить помеченный (участником или автоматической проверкой) контент в
 * очередь на рассмотрение модератором БЕЗ дополнительной валидации
 * (Requirement 19.3).
 *
 * Очередь материализована через существующую схему (см. замечание выше):
 *   • `community_threads.moderation_status = 'queued'` — маркер очереди;
 *   • запись `community_moderation_log` с `action = 'queue'` — аудит.
 *
 * `reporter` — идентификатор пометившего: id аккаунта участника при ручной
 * жалобе, либо `null`/`undefined` при автоматической пометке. Он сохраняется в
 * `moderator_id` записи журнала как актор постановки в очередь (`null` = авто),
 * что согласуется с семантикой `moderator_id` (Requirement 19.4).
 *
 * @returns созданная запись журнала.
 */
export async function flagForReview(
  topicId: number,
  reason: string,
  reporter?: number | null,
): Promise<CommunityModerationLog> {
  // Пометка в очередь — без доп. валидации содержимого (Requirement 19.3).
  await db
    .update(communityThreadsTable)
    .set({ moderationStatus: "queued" })
    .where(eq(communityThreadsTable.id, topicId));

  return logAction({
    targetType: "thread",
    targetId: topicId,
    action: "queue",
    reason,
    moderatorId: reporter ?? null, // null = автоматическая пометка
  });
}

/**
 * Записать модерационное действие в `community_moderation_log` с причиной и
 * идентификатором модератора (Requirement 19.4). `moderatorId = null`
 * (или отсутствует) означает автоматическое действие.
 *
 * @returns созданная строка журнала.
 */
export async function logAction(entry: ModerationLogEntry): Promise<CommunityModerationLog> {
  const [row] = await db
    .insert(communityModerationLogTable)
    .values({
      targetType: entry.targetType,
      targetId: entry.targetId,
      action: entry.action,
      reason: entry.reason ?? null,
      moderatorId: entry.moderatorId ?? null,
    })
    .returning();
  return row;
}

/**
 * Moderation_Service — агрегированная точка доступа к модерационной логике:
 * чистое скринирование (Task 7.1) + эффектные действия границ/очереди/журнала
 * (Task 7.2). Роут-слой (Task 7.3) потребляет этот объект.
 */
export const ModerationService = {
  // Task 7.1 — чистое скринирование
  screen,
  containsObscenity,
  containsPii,
  containsDefamation,
  isSpam,
  // Task 7.2 — границы зон / очередь / журнал
  enforceZoneBoundary,
  flagForReview,
  logAction,
} as const;
