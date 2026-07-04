/**
 * Property test for the PRO_Protected_Layer noindex policy.
 *
 * Property 4: любой путь PRO_Protected_Layer всегда несёт
 *             `X-Robots-Tag: noindex` и отсутствует в sitemap.
 *
 * **Validates: Requirement 7.2 (Property 4)**
 *
 * Module under test (`src/lib/communitySeo.ts`):
 *   - `isProtectedNoindexPath(path: string): boolean` — чистый предикат,
 *      зеркалящий условие middleware `X-Robots-Tag: noindex` в `src/app.ts`.
 *   - `PROTECTED_NOINDEX_PATTERNS` — единый источник истины паттернов,
 *      импортируемый как в middleware, так и в этом тесте (нет расхождения).
 *
 * Контекст. Инвариант noindex реализован НЕ в самом ответе, а middleware,
 * который выставляет заголовок `X-Robots-Tag: noindex, nofollow, noarchive`
 * для любого пути, матчащего один из `NOINDEX_PATH_PATTERNS`. Для
 * PRO_Protected_Layer соответствующие паттерны вынесены в чистый модуль
 * `communitySeo.ts` и импортируются в `app.ts`, поэтому инвариант проверяется
 * на предикате `isProtectedNoindexPath(path)`, который является точным
 * зеркалом membership-условия middleware. «Отсутствие в sitemap» — это то же
 * самое membership-условие: sitemap-генератор исключает пути, для которых
 * предикат истинен.
 *
 * Properties verified here:
 *   4.1 (protected ⇒ noindex) — для ЛЮБОГО пути PRO_Protected_Layer
 *       (`/api/community/pro/protected/<random>`,
 *        `/pro/<specialty>/protected/<random>`,
 *        `/marketplace/pro/<specialty>/protected`) предикат возвращает `true`
 *       (⇒ noindex + исключение из sitemap).
 *   4.2 (public ⇒ indexable) — для ЛЮБОГО публичного пути
 *       (`/pro/<specialty>` без `/protected`, `/goroda/<city>`, `/zhk/<slug>`,
 *        `/marketplace/pro/<specialty>`) предикат возвращает `false`
 *       (⇒ индексируется, присутствует в sitemap).
 *   4.3 (mutual exclusion) — путь не может быть одновременно protected и public.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/protected-noindex.property.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  isProtectedNoindexPath,
  PROTECTED_NOINDEX_PATTERNS,
} from "../../src/lib/communitySeo.js";

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Один URL-сегмент из безопасного алфавита `[a-z0-9-]` (slug-подобный),
 * гарантированно без слэшей и без завершающего/ведущего дефиса-мусора.
 * Достаточно для покрытия реального пространства specialty-slug / random id.
 */
const segmentArb: fc.Arbitrary<string> = fc
  .array(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyz0123456789".split(""),
      "-",
    ),
    { minLength: 1, maxLength: 24 },
  )
  .map((chars) => chars.join(""))
  // не даём сегменту быть пустым или состоять из одних дефисов после join
  .filter((s) => /[a-z0-9]/.test(s));

/** Специализация PRO-сообщества (slug), напр. `plitochnik`, `elektrik`. */
const specialtyArb = segmentArb;

/** Случайный «хвост» пути (id темы, вложенный ресурс и т.п.). */
const tailArb = segmentArb;

// ─── Protected path generators (must ALL be noindex) ──────────────────────────

const protectedApiArb: fc.Arbitrary<string> = fc.oneof(
  // точный корень закрытого API-слоя
  fc.constant("/api/community/pro/protected"),
  fc.constant("/api/community/pro/protected/"),
  // произвольный вложенный ресурс закрытого слоя
  tailArb.map((t) => `/api/community/pro/protected/${t}`),
);

const protectedFacadeArb: fc.Arbitrary<string> = fc.oneof(
  // /pro/<specialty>/protected  (фасад Next.js)
  specialtyArb.map((s) => `/pro/${s}/protected`),
  fc.tuple(specialtyArb, tailArb).map(([s, t]) => `/pro/${s}/protected/${t}`),
  // /marketplace/pro/<specialty>/protected  (server-to-server путь)
  specialtyArb.map((s) => `/marketplace/pro/${s}/protected`),
  fc
    .tuple(specialtyArb, tailArb)
    .map(([s, t]) => `/marketplace/pro/${s}/protected/${t}`),
);

const protectedPathArb: fc.Arbitrary<string> = fc.oneof(
  protectedApiArb,
  protectedFacadeArb,
);

// ─── Public path generators (must ALL be indexable) ───────────────────────────

const publicPathArb: fc.Arbitrary<string> = fc.oneof(
  // PRO_Public_Layer: /pro/<specialty> без суффикса /protected
  specialtyArb.map((s) => `/pro/${s}`),
  specialtyArb.map((s) => `/marketplace/pro/${s}`),
  // Sosedi_Zone: города и ЖК — индексируемые публичные страницы
  segmentArb.map((c) => `/goroda/${c}`),
  segmentArb.map((z) => `/zhk/${z}`),
  // City_Feed / прочие публичные PRO-подпути, НЕ являющиеся /protected
  fc.tuple(specialtyArb, tailArb).map(([s, t]) => `/pro/${s}/${t}`),
);

// ─── Property 4.1 — every protected path is noindex ───────────────────────────

describe("communitySeo — Property 4.1: PRO_Protected_Layer ⇒ noindex", () => {
  // Validates: Requirement 7.2 (Property 4)

  it("isProtectedNoindexPath === true для ЛЮБОГО protected-пути", () => {
    fc.assert(
      fc.property(protectedPathArb, (path) => {
        assert.equal(
          isProtectedNoindexPath(path),
          true,
          `protected путь должен быть noindex: ${JSON.stringify(path)}`,
        );
      }),
      { numRuns: 500 },
    );
  });

  it("конкретные protected-пути из дизайна помечены noindex", () => {
    for (const path of [
      "/api/community/pro/protected",
      "/api/community/pro/protected/",
      "/api/community/pro/protected/threads/42",
      "/pro/plitochnik/protected",
      "/pro/elektrik/protected/thread-7",
      "/marketplace/pro/santehnik/protected",
      "/marketplace/pro/santehnik/protected/99",
    ]) {
      assert.equal(
        isProtectedNoindexPath(path),
        true,
        `должен быть noindex: ${path}`,
      );
    }
  });
});

// ─── Property 4.2 — every public path stays indexable ─────────────────────────

describe("communitySeo — Property 4.2: публичный слой ⇒ indexable", () => {
  // Validates: Requirement 7.2 (Property 4)

  it("isProtectedNoindexPath === false для ЛЮБОГО публичного пути", () => {
    fc.assert(
      fc.property(publicPathArb, (path) => {
        assert.equal(
          isProtectedNoindexPath(path),
          false,
          `публичный путь не должен быть noindex: ${JSON.stringify(path)}`,
        );
      }),
      { numRuns: 500 },
    );
  });

  it("конкретные публичные пути остаются индексируемыми", () => {
    for (const path of [
      "/pro/plitochnik",
      "/marketplace/pro/plitochnik",
      "/goroda/moskva",
      "/zhk/zarya",
      "/pro/elektrik/feed",
      // граничные: 'protected' как часть другого сегмента НЕ матчит
      "/pro/elektrik/protectedX",
      "/pro/protected", // нет <specialty> между pro и protected
    ]) {
      assert.equal(
        isProtectedNoindexPath(path),
        false,
        `должен оставаться indexable: ${path}`,
      );
    }
  });
});

// ─── Property 4.3 — protected and public partitions are disjoint ──────────────

describe("communitySeo — Property 4.3: protected и public не пересекаются", () => {
  // Validates: Requirement 7.2 (Property 4)

  it("ни один сгенерированный публичный путь не совпадает с protected", () => {
    fc.assert(
      fc.property(publicPathArb, (path) => {
        const isProtected = isProtectedNoindexPath(path);
        // Публичный путь ⇒ индексируемый ⇒ присутствует в sitemap.
        assert.equal(
          isProtected,
          false,
          `публичный путь ошибочно попал в protected: ${JSON.stringify(path)}`,
        );
      }),
      { numRuns: 300 },
    );
  });

  it("паттерны экспортированы и непусты (единый источник истины)", () => {
    assert.ok(
      Array.isArray(PROTECTED_NOINDEX_PATTERNS) &&
        PROTECTED_NOINDEX_PATTERNS.length > 0,
      "PROTECTED_NOINDEX_PATTERNS должен быть непустым массивом",
    );
    assert.ok(
      PROTECTED_NOINDEX_PATTERNS.every((rx) => rx instanceof RegExp),
      "все элементы PROTECTED_NOINDEX_PATTERNS должны быть RegExp",
    );
  });

  it("пустой/невалидный путь не считается protected", () => {
    assert.equal(isProtectedNoindexPath(""), false);
    // @ts-expect-error — проверяем защитную ветку на non-string входе
    assert.equal(isProtectedNoindexPath(undefined), false);
  });
});
