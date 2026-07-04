/**
 * Unit tests for SEO content-threshold logic (Task 11.1).
 *
 * **Validates: Requirement 16.2** — оценка «богатства» контента страницы ЖК/города
 * из её сигналов (сид-данные, число тем, агрегированные цены, AI-сид).
 * **Validates: Requirement 16.3** — гейт индексируемости: страница индексируема
 * только при достижении минимального порога контента (граница below/at/above).
 *
 * Тестируем ЧИСТЫЕ, детерминированные функции — БД не требуется. `@workspace/db`
 * бросает при загрузке без DATABASE_URL (импортируется как тип в модуле под
 * тестом), поэтому задаём фиктивную строку до динамического импорта.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const {
  computeContentScore,
  meetsContentThreshold,
  enrichZhkSeedData,
  getMinContentScore,
  DEFAULT_MIN_CONTENT_SCORE,
  SEO_MIN_CONTENT_SCORE_ENV,
  CONTENT_SCORE_WEIGHTS,
  THREAD_SCORE_CAP,
  MIN_SEEDED_TOPICS,
} = await import("../../src/lib/seoContentThreshold.js");

// ─── computeContentScore (Requirement 16.2) ─────────────────────────────────

describe("computeContentScore (Requirement 16.2)", () => {
  it("пустая страница без сигналов → 0", () => {
    assert.equal(computeContentScore({}), 0);
  });

  it("складывает веса сид-данных застройщик/срок/корпуса", () => {
    const w = CONTENT_SCORE_WEIGHTS;
    assert.equal(
      computeContentScore({
        hasDeveloper: true,
        hasCompletionDate: true,
        buildingsCount: 3,
      }),
      w.developer + w.completionDate + w.buildings,
    );
  });

  it("корпуса засчитываются только при count > 0", () => {
    assert.equal(computeContentScore({ buildingsCount: 0 }), 0);
    assert.equal(computeContentScore({ buildingsCount: 1 }), CONTENT_SCORE_WEIGHTS.buildings);
  });

  it("суммирует авто- и реальные темы по weight за тему", () => {
    // 1 auto + 2 real = 3 темы (в пределах cap) → 3 * perThread
    assert.equal(
      computeContentScore({ autoThreadCount: 1, realThreadCount: 2 }),
      3 * CONTENT_SCORE_WEIGHTS.perThread,
    );
  });

  it("вклад тем ограничен сверху THREAD_SCORE_CAP", () => {
    const many = computeContentScore({ realThreadCount: 999 });
    assert.equal(many, THREAD_SCORE_CAP * CONTENT_SCORE_WEIGHTS.perThread);
  });

  it("учитывает агрегированные цены и AI-сид-текст", () => {
    assert.equal(
      computeContentScore({ hasAggregatedPrices: true, hasAiSeedBody: true }),
      CONTENT_SCORE_WEIGHTS.aggregatedPrices + CONTENT_SCORE_WEIGHTS.aiSeedBody,
    );
  });

  it("детерминирована и игнорирует некорректные счётчики", () => {
    const input = { buildingsCount: -5, autoThreadCount: Number.NaN, realThreadCount: 2 };
    assert.equal(computeContentScore(input), computeContentScore(input));
    assert.equal(computeContentScore(input), 2 * CONTENT_SCORE_WEIGHTS.perThread);
  });
});

// ─── meetsContentThreshold: граница below / at / above (Requirement 16.3) ────

describe("meetsContentThreshold — граница порога (Requirement 16.3)", () => {
  const T = 10;

  it("НИЖЕ порога → не индексируема", () => {
    assert.equal(meetsContentThreshold(T - 1, T), false);
    assert.equal(meetsContentThreshold(0, T), false);
  });

  it("РОВНО на пороге → индексируема", () => {
    assert.equal(meetsContentThreshold(T, T), true);
  });

  it("ВЫШЕ порога → индексируема", () => {
    assert.equal(meetsContentThreshold(T + 1, T), true);
    assert.equal(meetsContentThreshold(1000, T), true);
  });

  it("монотонная граница T-1 / T / T+1", () => {
    assert.equal(meetsContentThreshold(T - 1, T), false);
    assert.equal(meetsContentThreshold(T, T), true);
    assert.equal(meetsContentThreshold(T + 1, T), true);
  });

  it("интеграция score→gate: тонкая страница не индексируема, наполненная — да", () => {
    const thin = computeContentScore({ hasDeveloper: true }); // 2 < 10
    assert.equal(meetsContentThreshold(thin, T), false);

    // Полные сид-данные (6) + 2 темы (4) = 10 → ровно на пороге, индексируема.
    const rich = computeContentScore({
      hasDeveloper: true,
      hasCompletionDate: true,
      buildingsCount: 2,
      realThreadCount: 2,
    });
    assert.equal(rich, 10);
    assert.equal(meetsContentThreshold(rich, T), true);
  });
});

// ─── getMinContentScore: env-конфиг порога ───────────────────────────────────

describe("getMinContentScore — конфигурируемый порог", () => {
  it("возвращает дефолт при отсутствии env", () => {
    delete process.env[SEO_MIN_CONTENT_SCORE_ENV];
    assert.equal(getMinContentScore(), DEFAULT_MIN_CONTENT_SCORE);
  });

  it("читает неотрицательное значение из env (включая 0)", () => {
    process.env[SEO_MIN_CONTENT_SCORE_ENV] = "25";
    assert.equal(getMinContentScore(), 25);
    process.env[SEO_MIN_CONTENT_SCORE_ENV] = "0";
    assert.equal(getMinContentScore(), 0);
    delete process.env[SEO_MIN_CONTENT_SCORE_ENV];
  });

  it("возвращает дефолт при некорректном/отрицательном env", () => {
    for (const bad of ["-3", "abc", ""]) {
      process.env[SEO_MIN_CONTENT_SCORE_ENV] = bad;
      assert.equal(getMinContentScore(), DEFAULT_MIN_CONTENT_SCORE);
    }
    delete process.env[SEO_MIN_CONTENT_SCORE_ENV];
  });
});

// ─── enrichZhkSeedData: чистый планировщик (Requirement 16.2) ────────────────

describe("enrichZhkSeedData — планировщик сид-наполнения (Requirement 16.2)", () => {
  it("пустой ЖК → перечислены все недостающие поля, порог не достигнут", () => {
    const plan = enrichZhkSeedData({}, {}, 10);
    assert.deepEqual(plan.missing.sort(), [
      "aggregatedPrices",
      "aiSeedBody",
      "autoTopics",
      "buildings",
      "completionDate",
      "developer",
    ]);
    assert.equal(plan.currentScore, 0);
    assert.equal(plan.meetsThreshold, false);
  });

  it("полностью наполненный ЖК → нечего заполнять, порог достигнут", () => {
    const plan = enrichZhkSeedData(
      {
        developer: "ПИК",
        completionDate: "2025 Q4",
        buildings: [{ name: "Корпус 1" }, { name: "Корпус 2" }],
        bodyMd: "Описание района и инфраструктуры ЖК.",
      },
      { threadCount: MIN_SEEDED_TOPICS, hasAggregatedPrices: true },
      10,
    );
    assert.deepEqual(plan.missing, []);
    assert.equal(plan.meetsThreshold, true);
  });

  it("частичное наполнение → перечислены только пробелы", () => {
    const plan = enrichZhkSeedData(
      { developer: "Самолёт", buildings: [{ name: "К1" }] },
      { threadCount: 1 },
      10,
    );
    assert.ok(plan.missing.includes("completionDate"));
    assert.ok(plan.missing.includes("autoTopics")); // 1 < MIN_SEEDED_TOPICS
    assert.ok(plan.missing.includes("aggregatedPrices"));
    assert.ok(plan.missing.includes("aiSeedBody"));
    assert.ok(!plan.missing.includes("developer"));
    assert.ok(!plan.missing.includes("buildings"));
  });

  it("пустые строки трактуются как незаполненные поля", () => {
    const plan = enrichZhkSeedData(
      { developer: "   ", completionDate: "", bodyMd: "  " },
      {},
      10,
    );
    assert.ok(plan.missing.includes("developer"));
    assert.ok(plan.missing.includes("completionDate"));
    assert.ok(plan.missing.includes("aiSeedBody"));
  });
});
