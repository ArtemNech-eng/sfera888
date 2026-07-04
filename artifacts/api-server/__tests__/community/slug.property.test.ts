/**
 * Property test for `communitySlug.ts` (Slug-генерация City / ZhK_Record).
 *
 * Property 1: для любого названия сгенерированный slug соответствует
 *             `^[a-z0-9-]{1,100}$` и уникален в пределах Geo_Service.
 *
 * **Validates: Requirement 1.6 (Property 1)**
 *
 * Module under test (`src/lib/communitySlug.ts`):
 *   - `slugify(input: string): string`         — чистая нормализация
 *   - `SLUG_RE = /^[a-z0-9-]{1,100}$/`          — инвариант результата
 *   - `SLUG_MAX_LEN = 100`
 *   - `resolveUniqueSlug(base, isTaken)`        — разрешение коллизий суффиксом `-N`
 *
 * Properties verified here:
 *   1.1 (format)     — для ЛЮБОЙ строки (кириллица, пунктуация, эмодзи,
 *                      пробелы, очень длинные строки) `slugify` возвращает
 *                      значение, матчащее `^[a-z0-9-]{1,100}$` и ≤ 100 символов.
 *   1.2 (uniqueness) — генерация slug-ов для множества (в т.ч. коллизирующих)
 *                      названий через `resolveUniqueSlug(base, isTaken)` с
 *                      in-memory `Set` в роли `isTaken` даёт попарно различные
 *                      результаты, каждый из которых по-прежнему матчит
 *                      `SLUG_RE` и ≤ 100 символов.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/slug.property.test.ts
 */

// `communitySlug.ts` статически импортирует `@workspace/db`, который бросает
// исключение на этапе загрузки модуля, если `DATABASE_URL` не задан. pg.Pool
// не подключается лениво, поэтому фиктивной строки достаточно — ни одно
// свойство в этом файле не выполняет реальных запросов (`resolveUniqueSlug`
// принимает инъектируемый `isTaken`).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Динамический импорт с `.js`-расширением: гарантирует, что присваивание
// `DATABASE_URL` выше выполнится ДО загрузки `@workspace/db`.
const communitySlug = await import("../../src/lib/communitySlug.js");
const { slugify, resolveUniqueSlug, SLUG_RE, SLUG_MAX_LEN } = communitySlug;

// ─── Arbitraries ────────────────────────────────────────────────────────────

const cyrillicCharArb = fc.constantFrom(
  "а", "б", "в", "г", "д", "е", "ё", "ж", "з", "и", "й", "к", "л", "м",
  "н", "о", "п", "р", "с", "т", "у", "ф", "х", "ц", "ч", "ш", "щ", "ъ",
  "ы", "ь", "э", "ю", "я",
  "А", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И", "К", "Л", "М", "Н", "О",
  "П", "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ч", "Ш", "Щ", "Э", "Ю", "Я",
);

const latinCharArb = fc.constantFrom(
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "A", "B", "C", "Z", "0", "1", "2", "3", "9",
);

const punctCharArb = fc.constantFrom(
  "!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "«", "»", "—", "–",
  "-", "_", "/", "\\", ".", ",", ";", ":", "'", '"', "?", "№", "+", "=",
);

const whitespaceCharArb = fc.constantFrom(" ", "\t", "\n", "\r", "\u00a0", "   ");

const emojiCharArb = fc.constantFrom(
  "😀", "🎉", "🏠", "✨", "🚀", "💡", "🔥", "🌟", "🇷🇺", "👨‍👩‍👧",
);

// Rich mixed character stream covering every code path of the normalizer.
const richCharArb = fc.oneof(
  { weight: 4, arbitrary: cyrillicCharArb },
  { weight: 3, arbitrary: latinCharArb },
  { weight: 3, arbitrary: punctCharArb },
  { weight: 2, arbitrary: whitespaceCharArb },
  { weight: 1, arbitrary: emojiCharArb },
);

const richStringArb = fc
  .array(richCharArb, { minLength: 0, maxLength: 80 })
  .map((xs) => xs.join(""));

// A "very long" input that will exceed SLUG_MAX_LEN after transliteration.
const veryLongArb = fc
  .array(fc.oneof(cyrillicCharArb, latinCharArb), { minLength: 120, maxLength: 300 })
  .map((xs) => xs.join(""));

// The full name space: rich mixed strings, arbitrary unicode strings,
// very-long strings, plus hand-picked degenerate cases.
const nameArb = fc.oneof(
  { weight: 6, arbitrary: richStringArb },
  { weight: 2, arbitrary: fc.string({ maxLength: 60 }) },
  { weight: 2, arbitrary: veryLongArb },
  {
    weight: 1,
    arbitrary: fc.constantFrom(
      "",            // пусто → fallback
      "   ",         // только пробелы → fallback
      "!!!",         // только пунктуация → fallback
      "«»—",         // только типографика → fallback
      "😀😀😀",       // только эмодзи → fallback
      "---",         // только дефисы → fallback
      "ЖК «Заря»",
      "Санкт-Петербург",
      "Иван Петров",
      "ул. Ленина, д. 1",
    ),
  },
);

// ─── Property 1.1 — format invariant of the pure `slugify` ────────────────────

describe("communitySlug — Property 1.1: slugify format invariant", () => {
  // Validates: Requirement 1.6 (Property 1)

  it("output matches ^[a-z0-9-]{1,100}$ for ANY input", () => {
    fc.assert(
      fc.property(nameArb, (name) => {
        const slug = slugify(name);
        assert.ok(
          SLUG_RE.test(slug),
          `slugify(${JSON.stringify(name)}) = ${JSON.stringify(slug)} must match ${SLUG_RE}`,
        );
      }),
      { numRuns: 500 },
    );
  });

  it("output length is within [1, SLUG_MAX_LEN] for ANY input", () => {
    fc.assert(
      fc.property(nameArb, (name) => {
        const slug = slugify(name);
        assert.ok(slug.length >= 1, `slug must be non-empty for ${JSON.stringify(name)}`);
        assert.ok(
          slug.length <= SLUG_MAX_LEN,
          `slug length ${slug.length} exceeds SLUG_MAX_LEN=${SLUG_MAX_LEN} for ${JSON.stringify(name)}`,
        );
      }),
      { numRuns: 500 },
    );
  });

  it("output never has a leading/trailing dash and never contains '--'", () => {
    fc.assert(
      fc.property(nameArb, (name) => {
        const slug = slugify(name);
        assert.ok(!slug.startsWith("-"), `slug ${JSON.stringify(slug)} has leading '-'`);
        assert.ok(!slug.endsWith("-"), `slug ${JSON.stringify(slug)} has trailing '-'`);
        assert.ok(!slug.includes("--"), `slug ${JSON.stringify(slug)} contains '--'`);
      }),
      { numRuns: 300 },
    );
  });

  it("is idempotent: slugify(slugify(x)) === slugify(x)", () => {
    fc.assert(
      fc.property(nameArb, (name) => {
        const once = slugify(name);
        assert.equal(slugify(once), once);
      }),
      { numRuns: 300 },
    );
  });

  it("degenerate inputs (empty / whitespace / punctuation) fall back to a valid slug", () => {
    for (const degenerate of ["", "   ", "!!!", "«»—", "😀😀😀", "---"]) {
      const slug = slugify(degenerate);
      assert.ok(
        SLUG_RE.test(slug),
        `slugify(${JSON.stringify(degenerate)}) = ${JSON.stringify(slug)} must still match ${SLUG_RE}`,
      );
    }
  });
});

// ─── Property 1.2 — uniqueness via resolveUniqueSlug ──────────────────────────

describe("communitySlug — Property 1.2: resolveUniqueSlug global uniqueness", () => {
  // Validates: Requirement 1.6 (Property 1)
  //
  // Simulate the production invariant `cities.slug` / `zhk.slug` are globally
  // unique: feed many (possibly colliding) names through slugify →
  // resolveUniqueSlug against a growing in-memory taken-set. Every issued slug
  // must be distinct AND still match SLUG_RE with length ≤ SLUG_MAX_LEN.

  it("generating slugs for many names yields all-distinct, well-formed results", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nameArb, { minLength: 1, maxLength: 60 }),
        async (names) => {
          const taken = new Set<string>();
          const issued: string[] = [];

          for (const name of names) {
            const base = slugify(name);
            const slug = await resolveUniqueSlug(
              base,
              async (candidate) => taken.has(candidate),
            );

            // Never hand out an already-taken slug (global uniqueness).
            assert.ok(
              !taken.has(slug),
              `resolveUniqueSlug returned an already-taken slug: ${JSON.stringify(slug)}`,
            );
            // Uniqueness must not break the format invariant.
            assert.ok(
              SLUG_RE.test(slug),
              `resolved slug ${JSON.stringify(slug)} must match ${SLUG_RE}`,
            );
            assert.ok(
              slug.length <= SLUG_MAX_LEN,
              `resolved slug length ${slug.length} exceeds SLUG_MAX_LEN=${SLUG_MAX_LEN}`,
            );

            taken.add(slug);
            issued.push(slug);
          }

          assert.equal(
            issued.length,
            names.length,
            "should issue exactly one slug per name",
          );
          assert.equal(
            new Set(issued).size,
            issued.length,
            `expected ${issued.length} distinct slugs, got ${new Set(issued).size}`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("names that collapse to the SAME base still get distinct, valid slugs", async () => {
    // All of these normalize to the fallback "obekt" — the hardest collision
    // case. resolveUniqueSlug must disambiguate them with `-N` suffixes.
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 50 }), async (count) => {
        const collidingNames = Array.from({ length: count }, () => "!!!");
        const taken = new Set<string>();
        const issued: string[] = [];

        for (const name of collidingNames) {
          const slug = await resolveUniqueSlug(
            slugify(name),
            async (candidate) => taken.has(candidate),
          );
          assert.ok(SLUG_RE.test(slug), `slug ${JSON.stringify(slug)} must match ${SLUG_RE}`);
          assert.ok(slug.length <= SLUG_MAX_LEN);
          assert.ok(!taken.has(slug), `duplicate slug issued: ${JSON.stringify(slug)}`);
          taken.add(slug);
          issued.push(slug);
        }

        assert.equal(new Set(issued).size, count, "all colliding names must get distinct slugs");
      }),
      { numRuns: 30 },
    );
  });

  it("with no collisions (isTaken = () => false), the slug equals its base", async () => {
    await fc.assert(
      fc.asyncProperty(nameArb, async (name) => {
        const base = slugify(name);
        const slug = await resolveUniqueSlug(base, async () => false);
        assert.equal(slug, base);
      }),
      { numRuns: 100 },
    );
  });
});
