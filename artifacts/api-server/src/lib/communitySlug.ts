/**
 * Slug-генерация для гео-сообщества «ХочуТакже» (City / ZhK_Record).
 *
 * Requirement 1.6: каждый City и каждый ZhK_Record получает slug, уникальный
 * в пределах ВСЕГО Geo_Service, состоящий из строчных латинских букв, цифр и
 * дефисов, длиной от 1 до 100 символов (`^[a-z0-9-]{1,100}$`).
 *
 * Модуль намеренно разделён на два уровня:
 *   1. `slugify(name)`         — чистая, детерминированная нормализация без БД
 *                                (транслитерация → `[a-z0-9-]` → усечение).
 *                                Легко покрывается property-тестом (Task 2.2).
 *   2. `generateSlug(name, scope)` — DB-aware обёртка: берёт `slugify(name)` как
 *                                базу и разрешает коллизии суффиксом `-N`,
 *                                проверяя занятость по существующим slug в
 *                                таблицах `cities` и `zhk` (глобальная
 *                                уникальность).
 *
 * Таблица транслитерации совпадает с `src/lib/slug.ts` (GOST-7.79 система B,
 * упрощённая) — slug для одного и того же имени обязан быть идентичным
 * независимо от кодопути.
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (Task 2.1, Requirement 1.6, Property 1)
 */

import { db, citiesTable, zhkTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/** Область применения slug в гео-иерархии. */
export type SlugScope = "city" | "zhk";

/** Максимальная длина slug (совпадает с `cities.slug` / `zhk.slug` varchar(100)). */
export const SLUG_MAX_LEN = 100;

/** Регулярка-инвариант результата (Requirement 1.6). */
export const SLUG_RE = /^[a-z0-9-]{1,100}$/;

/**
 * Запасной slug на случай, когда после нормализации не осталось ни одного
 * значимого символа (например, имя состоит только из знаков препинания).
 * Гарантирует нижнюю границу длины `{1,…}`.
 */
const SLUG_FALLBACK = "obekt";

/** Максимальное число попыток подобрать уникальный суффикс `-N`. */
const MAX_ATTEMPTS = 9999;

// GOST-7.79 система B (упрощённая) — синхронизировано с `src/lib/slug.ts`.
const TRANSLIT: Record<string, string> = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d",
  "е": "e", "ё": "yo", "ж": "zh", "з": "z", "и": "i",
  "й": "y", "к": "k", "л": "l", "м": "m", "н": "n",
  "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
  "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch",
  "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "",
  "э": "e", "ю": "yu", "я": "ya",
};

/**
 * Нормализовать произвольную строку в базовый slug БЕЗ гарантии непустоты.
 * Транслитерирует кириллицу, приводит к нижнему регистру, заменяет любой
 * символ вне `[a-z0-9]` на дефис, схлопывает повторы дефисов и срезает
 * ведущие/замыкающие дефисы.
 */
function normalizeBare(input: string): string {
  const lower = input.toLowerCase();
  let out = "";
  for (const ch of lower) {
    if (TRANSLIT[ch] !== undefined) {
      out += TRANSLIT[ch];
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch;
    } else {
      out += "-";
    }
  }
  return out.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Чистая (без БД) детерминированная генерация slug из названия.
 *
 * Гарантии результата:
 *   - соответствует `^[a-z0-9-]{1,100}$` (Requirement 1.6) для ЛЮБОГО входа;
 *   - начинается с буквенно-цифрового символа (нет ведущего дефиса);
 *   - длина ≤ 100 (усечение с обрезкой висящего дефиса);
 *   - если после нормализации пусто — используется `SLUG_FALLBACK`.
 *
 * Примеры:
 *   "Иван Петров"     → "ivan-petrov"
 *   "Санкт-Петербург" → "sankt-peterburg"
 *   "ЖК «Заря»"       → "zhk-zarya"
 *   "!!!"             → "obekt"
 */
export function slugify(input: string): string {
  let base = normalizeBare(input);

  if (base.length === 0) {
    // Запасной вариант тоже прогоняем через нормализацию на всякий случай.
    base = normalizeBare(SLUG_FALLBACK) || "n";
  }

  if (base.length > SLUG_MAX_LEN) {
    base = base.slice(0, SLUG_MAX_LEN).replace(/-+$/g, "");
  }

  return base;
}

/**
 * Проверить, занят ли slug где-либо в гео-иерархии (глобальная уникальность
 * по Requirement 1.6 — сразу в `cities` и `zhk`).
 */
async function slugTakenGlobally(candidate: string): Promise<boolean> {
  const [cityRows, zhkRows] = await Promise.all([
    db
      .select({ slug: citiesTable.slug })
      .from(citiesTable)
      .where(eq(citiesTable.slug, candidate))
      .limit(1),
    db
      .select({ slug: zhkTable.slug })
      .from(zhkTable)
      .where(eq(zhkTable.slug, candidate))
      .limit(1),
  ]);
  return cityRows.length > 0 || zhkRows.length > 0;
}

/**
 * Разрешить коллизии, добавляя суффикс `-2`, `-3`, … пока slug не окажется
 * свободным. Базовый slug усекается так, чтобы `base + "-N"` укладывался в
 * `SLUG_MAX_LEN`. `isTaken` — инъектируемый чекер (реальная БД в проде,
 * произвольный предикат в тестах).
 */
export async function resolveUniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  // База уже гарантированно валидна и ≤ 100 (см. `slugify`).
  if (!(await isTaken(base))) {
    return base;
  }

  for (let n = 2; n <= MAX_ATTEMPTS; n++) {
    const suffix = `-${n}`;
    const room = Math.max(1, SLUG_MAX_LEN - suffix.length);
    const trimmed = base.slice(0, room).replace(/-+$/g, "") || base.slice(0, 1);
    const candidate = `${trimmed}${suffix}`;
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  throw new Error(
    `[communitySlug] не удалось подобрать уникальный slug для базы "${base}" за ${MAX_ATTEMPTS} попыток`,
  );
}

/**
 * Сгенерировать глобально уникальный slug для нового City или ZhK_Record.
 *
 * Пайплайн (Requirement 1.6): транслитерация кириллицы → нормализация к
 * `[a-z0-9-]` → усечение до 100 → суффикс `-N` при коллизии (проверка по
 * существующим slug в таблицах `cities` и `zhk`).
 *
 * @param name  Произвольное название (City или ЖК).
 * @param scope Область (`"city"` | `"zhk"`). Уникальность в любом случае
 *              проверяется ГЛОБАЛЬНО по обеим таблицам, параметр фиксирует
 *              семантику вызова.
 * @returns slug, соответствующий `^[a-z0-9-]{1,100}$` и уникальный в Geo_Service.
 */
export async function generateSlug(name: string, scope: SlugScope): Promise<string> {
  void scope; // Уникальность глобальна; scope сохранён в API для ясности вызова.
  const base = slugify(name);
  return resolveUniqueSlug(base, slugTakenGlobally);
}
