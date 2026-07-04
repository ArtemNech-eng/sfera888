/**
 * Unit tests for the Living-community metric and All-Russia master access
 * helpers (Task 12.2).
 *
 * **Validates: Requirements 17.3, 18.1, 18.2, 18.3**
 *   • 17.3 — число Living_ZhK отдаётся обособленной метрикой (`metric:
 *     'living_zhk'`), отдельно от объёма трафика.
 *   • 18.1/18.2 — любой мастер получает полный доступ к All_Russia_Feed
 *     независимо от города, стартового набора и локальной плотности жителей.
 *   • 18.3 — привлечение мастеров помечено как параллельный канал роста.
 *
 * Тестируем ЧИСТЫЕ функции (`buildLivingZhkMetric`, `masterHasAllRussiaAccess`,
 * `describeMasterAllRussiaAccess`), не обращающиеся к БД. DB-хелперы
 * (`countLivingZhk`, `countLivingZhkByStarterCity`) требуют Postgres и
 * покрываются интеграционным слоем.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// `@workspace/db` бросает при загрузке без DATABASE_URL; тест не выполняет
// запросов (pg.Pool ленив), поэтому фиктивной строки достаточно.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const {
  buildLivingZhkMetric,
  masterHasAllRussiaAccess,
  describeMasterAllRussiaAccess,
  MASTER_RECRUITMENT_CHANNEL,
  MASTER_ROLE,
  LIVING_ZHK_STATUS,
} = await import("../../src/lib/communityMetrics.js");

describe("communityMetrics.buildLivingZhkMetric (Requirement 17.3)", () => {
  it("формирует обособленную метрику с дискриминатором 'living_zhk'", () => {
    const m = buildLivingZhkMetric(7);
    assert.equal(m.metric, "living_zhk");
    assert.equal(m.livingZhkCount, 7);
    assert.equal(m.starterOnly, false);
    assert.equal(m.cityId, null);
  });

  it("метрика не содержит поля объёма трафика (R17.3 — отдельно от трафика)", () => {
    const m = buildLivingZhkMetric(3, { starterOnly: true, cityId: 42 });
    assert.deepEqual(Object.keys(m).sort(), [
      "cityId",
      "livingZhkCount",
      "metric",
      "starterOnly",
    ]);
    assert.equal(m.starterOnly, true);
    assert.equal(m.cityId, 42);
  });

  it("нормализует отрицательные/нечисловые значения к 0", () => {
    assert.equal(buildLivingZhkMetric(-5).livingZhkCount, 0);
    assert.equal(buildLivingZhkMetric(Number.NaN).livingZhkCount, 0);
    assert.equal(buildLivingZhkMetric(2.9).livingZhkCount, 2);
  });

  it("LIVING_ZHK_STATUS соответствует статусу живого ЖК", () => {
    assert.equal(LIVING_ZHK_STATUS, "LIVING");
  });
});

describe("communityMetrics.masterHasAllRussiaAccess (Requirements 18.1, 18.2)", () => {
  it("возвращает true для мастера независимо от города и плотности жителей", () => {
    const cities = [null, 1, 999, undefined];
    const densities = [null, 0, 1, 5000, undefined];
    const starters = [true, false, null, undefined];

    for (const cityId of cities) {
      for (const localResidentDensity of densities) {
        for (const inStarterCity of starters) {
          const access = masterHasAllRussiaAccess({
            role: MASTER_ROLE,
            cityId: cityId as number | null | undefined,
            localResidentDensity: localResidentDensity as number | null | undefined,
            inStarterCity: inStarterCity as boolean | null | undefined,
          });
          assert.equal(
            access,
            true,
            `master must have access (city=${cityId}, density=${localResidentDensity}, starter=${inStarterCity})`,
          );
        }
      }
    }
  });

  it("мастер вне стартового города с нулевой плотностью → полный доступ (R18.2)", () => {
    assert.equal(
      masterHasAllRussiaAccess({
        role: MASTER_ROLE,
        cityId: 12345,
        inStarterCity: false,
        localResidentDensity: 0,
      }),
      true,
    );
  });

  it("роль по умолчанию (не задана) трактуется как мастер → true", () => {
    assert.equal(masterHasAllRussiaAccess({}), true);
    assert.equal(masterHasAllRussiaAccess({ cityId: 5 }), true);
  });

  it("не-мастер → false (доступ мастера неприменим)", () => {
    assert.equal(masterHasAllRussiaAccess({ role: "resident" }), false);
  });

  it("отсутствующий аккаунт → false", () => {
    assert.equal(masterHasAllRussiaAccess(null), false);
    assert.equal(masterHasAllRussiaAccess(undefined), false);
  });
});

describe("communityMetrics.describeMasterAllRussiaAccess (Requirement 18)", () => {
  it("для мастера: полный доступ без гейтинга по плотности/стартовому городу", () => {
    const d = describeMasterAllRussiaAccess({
      role: MASTER_ROLE,
      cityId: 777,
      inStarterCity: false,
      localResidentDensity: 0,
    });
    assert.equal(d.hasAccess, true);
    assert.equal(d.fullAccess, true);
    assert.equal(d.gatedByLocalDensity, false);
    assert.equal(d.gatedByStarterCity, false);
    assert.equal(d.reason, "master_full_access");
  });

  it("помечает привлечение мастеров как параллельный канал роста (R18.3)", () => {
    const d = describeMasterAllRussiaAccess({ role: MASTER_ROLE });
    assert.equal(d.recruitmentChannel, MASTER_RECRUITMENT_CHANNEL);
    assert.equal(MASTER_RECRUITMENT_CHANNEL, "all_russia_feed");
  });

  it("аноним → нет доступа, причина anonymous", () => {
    const d = describeMasterAllRussiaAccess(null);
    assert.equal(d.hasAccess, false);
    assert.equal(d.reason, "anonymous");
    assert.equal(d.gatedByLocalDensity, false);
    assert.equal(d.gatedByStarterCity, false);
  });

  it("не-мастер → нет доступа, причина not_master", () => {
    const d = describeMasterAllRussiaAccess({ role: "resident" });
    assert.equal(d.hasAccess, false);
    assert.equal(d.reason, "not_master");
  });
});
