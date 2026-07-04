/**
 * Property test for ZhK deduplication (Geo_Service, создание ЖК жителем).
 *
 * Property 2: создание ЖК с названием, эквивалентным существующему в том же
 *             City после `trim().toLowerCase()`, НИКОГДА не создаёт вторую
 *             запись — всегда возвращается существующий ЖК.
 *
 * **Validates: Requirement 4.5 (Property 2)**
 *
 * Module under test (`src/lib/geoService.ts`):
 *   - `normalizeZhkName(name): string` — чистый ключ дедупликации
 *     (`name.trim().toLowerCase()`), записываемый в `zhk.name_normalized`.
 *
 * Контекст. Дедупликация в дизайне реализована НЕ уникальным индексом (чтобы
 * можно было вернуть существующий ЖК, а не падать), а поиском `createZhk` по
 * ключу `(cityId, nameNormalized)`: при совпадении возвращается
 * `duplicate_suggested`, иначе вставляется новая запись. Ядром этого решения
 * является чистая функция `normalizeZhkName`. Реальный `createZhk` статически
 * тянет `@workspace/db` и обращается к БД, поэтому инвариант проверяется на
 * чистой `normalizeZhkName` ПЛЮС на in-memory модели хранилища, которая
 * ЗЕРКАЛИТ ту же семантику дедупа `(cityId, nameNormalized)`, что и SQL-поиск.
 *
 * Проверяемые свойства:
 *   2.1  Инвариантность ключа: для любого названия `n` и любого его
 *        «эквивалента» (добавление начальных/конечных пробелов + смена
 *        регистра) `normalizeZhkName` даёт ОДИН И ТОТ ЖЕ ключ.
 *   2.2  Дедуп в пределах города: прогон произвольной последовательности
 *        названий (с намеренными эквивалентными дублями) через модель,
 *        зеркалящую `createZhk`, НИКОГДА не создаёт две записи с одинаковым
 *        нормализованным названием в одном городе; повторный эквивалент
 *        всегда возвращает уже существующую запись (её id не меняется).
 *   2.3  Область дедупа — город: одинаковое нормализованное название в РАЗНЫХ
 *        городах создаёт РАЗНЫЕ записи (дедуп ограничен `cityId`).
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/zhk-dedup.property.test.ts
 */

// `geoService.ts` статически импортирует `@workspace/db`, который бросает на
// этапе загрузки, если `DATABASE_URL` не задан. pg.Pool не подключается лениво,
// поэтому фиктивной строки достаточно — ни одно свойство здесь не выполняет
// реальных запросов (тестируется чистая `normalizeZhkName` + in-memory модель).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Динамический импорт с `.js`-расширением: гарантирует, что присваивание
// `DATABASE_URL` выше выполнится ДО загрузки `@workspace/db`.
const geoService = await import("../../src/lib/geoService.js");
const { normalizeZhkName } = geoService;

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const cyrillicCharArb = fc.constantFrom(
  "а", "б", "в", "г", "д", "е", "ё", "ж", "з", "и", "й", "к", "л", "м",
  "н", "о", "п", "р", "с", "т", "у", "ф", "х", "ц", "ч", "ш", "щ",
  "ы", "э", "ю", "я",
);

const latinCharArb = fc.constantFrom(
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "0", "1", "2", "3", "9",
);

// Внутренние (не крайние) символы могут включать одиночные пробелы, дефисы,
// цифры и буквы — trim их НЕ трогает, поэтому они должны совпадать в
// эквивалентах побуквенно.
const innerCharArb = fc.oneof(
  { weight: 5, arbitrary: cyrillicCharArb },
  { weight: 4, arbitrary: latinCharArb },
  { weight: 1, arbitrary: fc.constantFrom(" ", "-", ".", "«", "»", "№") },
);

// Базовое название ЖК: непустой набор букв/цифр с возможными внутренними
// разделителями. Длину держим в разумных рамках (валидные названия 2..100).
const baseNameArb: fc.Arbitrary<string> = fc
  .array(innerCharArb, { minLength: 2, maxLength: 40 })
  .map((xs) => xs.join(""))
  // Гарантируем, что после trim остаётся непустая содержательная часть,
  // иначе «название» вырождается и дедуп-ключ становится пустой строкой.
  .filter((s) => s.trim().length >= 2);

// Символы окружающего пробела, которые удаляет String.prototype.trim()
// (включая таб, перевод строки, неразрывный пробел \u00a0).
const trimWhitespaceArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r", "\u00a0"), {
    minLength: 0,
    maxLength: 6,
  })
  .map((xs) => xs.join(""));

/** Случайно меняет регистр каждого символа строки (эквивалентно под lower()). */
function randomCaseFlip(s: string, seed: number): string {
  let out = "";
  let acc = seed >>> 0;
  for (const ch of s) {
    acc = (acc * 1103515245 + 12345) >>> 0;
    out += acc & 1 ? ch.toUpperCase() : ch.toLowerCase();
  }
  return out;
}

/**
 * Из базового названия строит «эквивалент»: тот же внутренний текст, но с
 * произвольными окружающими пробелами и произвольной сменой регистра.
 * По контракту `trim().toLowerCase()` такой эквивалент обязан давать тот же
 * нормализованный ключ, что и база.
 */
const equivalentPairArb = fc
  .record({
    base: baseNameArb,
    leadA: trimWhitespaceArb,
    trailA: trimWhitespaceArb,
    leadB: trimWhitespaceArb,
    trailB: trimWhitespaceArb,
    seedA: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
    seedB: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  })
  .map(({ base, leadA, trailA, leadB, trailB, seedA, seedB }) => ({
    a: leadA + randomCaseFlip(base, seedA) + trailA,
    b: leadB + randomCaseFlip(base, seedB) + trailB,
  }));

// ─── Property 2.1 — инвариантность ключа дедупликации ─────────────────────────

describe("ZhK dedup Property 2.1: normalizeZhkName инвариантен к trim + регистру", () => {
  // Validates: Requirement 4.5 (Property 2)

  it("эквивалентные (по trim/lower) названия дают ОДИН И ТОТ ЖЕ ключ", () => {
    fc.assert(
      fc.property(equivalentPairArb, ({ a, b }) => {
        assert.equal(
          normalizeZhkName(a),
          normalizeZhkName(b),
          `normalizeZhkName(${JSON.stringify(a)}) !== normalizeZhkName(${JSON.stringify(b)})`,
        );
      }),
      { numRuns: 500 },
    );
  });

  it("ключ действительно равен name.trim().toLowerCase() для любого ввода", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (name) => {
        assert.equal(normalizeZhkName(name), name.trim().toLowerCase());
      }),
      { numRuns: 300 },
    );
  });

  it("нормализация идемпотентна: normalize(normalize(x)) === normalize(x)", () => {
    fc.assert(
      fc.property(baseNameArb, (name) => {
        const once = normalizeZhkName(name);
        assert.equal(normalizeZhkName(once), once);
      }),
      { numRuns: 300 },
    );
  });
});

// ─── In-memory модель createZhk (зеркалит семантику `(cityId, nameNormalized)`) ─

interface ZhkRow {
  id: number;
  cityId: number;
  name: string;
  nameNormalized: string;
}

type CreateResult =
  | { status: "created"; row: ZhkRow }
  | { status: "duplicate_suggested"; row: ZhkRow };

/**
 * Модель хранилища ЖК, повторяющая логику `createZhk`:
 *   1) вычислить `nameNormalized = normalizeZhkName(name)`;
 *   2) искать существующую запись по ключу `(cityId, nameNormalized)`;
 *   3) если нашли — вернуть её (`duplicate_suggested`), НЕ создавая новую;
 *   4) иначе — вставить новую запись (`created`).
 * Использует ту же чистую `normalizeZhkName`, что и продакшн-код.
 */
class ZhkStoreModel {
  private rows: ZhkRow[] = [];
  private nextId = 1;

  create(cityId: number, name: string): CreateResult {
    const nameNormalized = normalizeZhkName(name);
    const existing = this.rows.find(
      (r) => r.cityId === cityId && r.nameNormalized === nameNormalized,
    );
    if (existing) {
      return { status: "duplicate_suggested", row: existing };
    }
    const row: ZhkRow = { id: this.nextId++, cityId, name: name.trim(), nameNormalized };
    this.rows.push(row);
    return { status: "created", row };
  }

  all(): readonly ZhkRow[] {
    return this.rows;
  }
}

// ─── Property 2.2 — дедуп в пределах города ───────────────────────────────────

describe("ZhK dedup Property 2.2: эквивалентные названия не создают дубликат в городе", () => {
  // Validates: Requirement 4.5 (Property 2)

  // Последовательность операций создания: несколько городов, часть названий —
  // намеренные эквиваленты одной базы. cityId ограничиваем малым множеством,
  // чтобы гарантированно провоцировать коллизии в одном городе.
  const opsArb = fc.array(
    fc.record({
      cityId: fc.integer({ min: 1, max: 3 }),
      pair: equivalentPairArb,
      useVariant: fc.boolean(), // подать 'a' или 'b' — оба эквивалентны
    }),
    { minLength: 1, maxLength: 60 },
  );

  it("после эквивалентного повтора запись не удваивается и возвращается та же", () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const store = new ZhkStoreModel();

        for (const op of ops) {
          const name = op.useVariant ? op.pair.a : op.pair.b;
          const key = normalizeZhkName(name);

          // Была ли уже запись с этим ключом в этом городе ДО операции?
          const before = store
            .all()
            .find((r) => r.cityId === op.cityId && r.nameNormalized === key);

          const res = store.create(op.cityId, name);

          if (before) {
            // Дубликат: не создаём новую, возвращаем существующую (тот же id).
            assert.equal(
              res.status,
              "duplicate_suggested",
              `эквивалентное название должно вернуть дубликат: ${JSON.stringify(name)}`,
            );
            assert.equal(
              res.row.id,
              before.id,
              "должна вернуться ИМЕННО существующая запись (тот же id)",
            );
          } else {
            assert.equal(res.status, "created");
          }
        }

        // Глобальный инвариант: в каждом городе ключ `nameNormalized` уникален.
        const seen = new Set<string>();
        for (const r of store.all()) {
          const compositeKey = `${r.cityId}::${r.nameNormalized}`;
          assert.ok(
            !seen.has(compositeKey),
            `дубликат в городе обнаружен: ${compositeKey}`,
          );
          seen.add(compositeKey);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("N эквивалентных вариантов одного названия в одном городе → ровно одна запись", () => {
    fc.assert(
      fc.property(
        fc.record({
          base: baseNameArb,
          cityId: fc.integer({ min: 1, max: 5 }),
          seeds: fc.array(fc.integer({ min: 0, max: 2 ** 31 - 1 }), {
            minLength: 1,
            maxLength: 30,
          }),
          pads: fc.array(trimWhitespaceArb, { minLength: 1, maxLength: 30 }),
        }),
        ({ base, cityId, seeds, pads }) => {
          const store = new ZhkStoreModel();
          let firstId: number | null = null;

          const n = Math.max(seeds.length, pads.length);
          for (let i = 0; i < n; i++) {
            const seed = seeds[i % seeds.length];
            const pad = pads[i % pads.length];
            const name = pad + randomCaseFlip(base, seed) + pad;
            const res = store.create(cityId, name);
            if (firstId === null) {
              assert.equal(res.status, "created");
              firstId = res.row.id;
            } else {
              assert.equal(res.status, "duplicate_suggested");
              assert.equal(res.row.id, firstId, "все эквиваленты → та же запись");
            }
          }

          // В этом городе должна быть ровно ОДНА запись с данным ключом.
          const key = normalizeZhkName(base);
          const matching = store
            .all()
            .filter((r) => r.cityId === cityId && r.nameNormalized === key);
          assert.equal(matching.length, 1, "ожидалась ровно одна запись на все эквиваленты");
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ─── Property 2.3 — область дедупа ограничена городом ─────────────────────────

describe("ZhK dedup Property 2.3: дедуп ограничен пределами одного City", () => {
  // Validates: Requirement 4.5 (Property 2)

  it("одинаковое нормализованное название в РАЗНЫХ городах → РАЗНЫЕ записи", () => {
    fc.assert(
      fc.property(
        fc.record({
          base: baseNameArb,
          cityA: fc.integer({ min: 1, max: 100 }),
          cityB: fc.integer({ min: 1, max: 100 }),
          seedA: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
          seedB: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        }),
        ({ base, cityA, cityB, seedA, seedB }) => {
          fc.pre(cityA !== cityB); // рассматриваем именно разные города

          const store = new ZhkStoreModel();
          const r1 = store.create(cityA, "  " + randomCaseFlip(base, seedA));
          const r2 = store.create(cityB, randomCaseFlip(base, seedB) + "  ");

          assert.equal(r1.status, "created");
          assert.equal(
            r2.status,
            "created",
            "то же название в другом городе должно создать новую запись",
          );
          assert.notEqual(r1.row.id, r2.row.id);
          // Ключ одинаков, но записи разведены по cityId.
          assert.equal(r1.row.nameNormalized, r2.row.nameNormalized);
        },
      ),
      { numRuns: 300 },
    );
  });
});
