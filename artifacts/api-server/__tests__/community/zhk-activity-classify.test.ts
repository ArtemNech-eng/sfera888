/**
 * Unit tests for Living_ZhK status classification (Task 12.1).
 *
 * **Validates: Requirement 17.2** — ЖК классифицируется как Living_ZhK при
 * достижении порога `>= N` активных жителей в неделю; иначе ему явно
 * присваивается статус NON_LIVING.
 *
 * Тестируем ЧИСТУЮ, детерминированную функцию `classifyZhkStatus`, которая не
 * обращается к БД. Агрегация (`aggregateZhkWeeklyActivity`) требует реального
 * Postgres и покрывается интеграционным слоем.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// `@workspace/db` бросает при загрузке без DATABASE_URL. Тест проверяет чистую
// функцию и не выполняет запросов, поэтому фиктивной строки достаточно (pg.Pool
// ленив). Импорт модуля под тестом — динамический, после установки env.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const {
  classifyZhkStatus,
  getLivingZhkThreshold,
  DEFAULT_LIVING_ZHK_MIN_WEEKLY_RESIDENTS,
  LIVING_ZHK_THRESHOLD_ENV,
} = await import("../../src/lib/zhkActivityCron.js");

describe("zhkActivityCron.classifyZhkStatus (Requirement 17.2)", () => {
  const N = 5;

  it("ровно на пороге (activeResidents == N) → LIVING", () => {
    assert.equal(classifyZhkStatus(N, N), "LIVING");
  });

  it("выше порога (activeResidents > N) → LIVING", () => {
    assert.equal(classifyZhkStatus(N + 1, N), "LIVING");
    assert.equal(classifyZhkStatus(1000, N), "LIVING");
  });

  it("ниже порога (activeResidents < N) → NON_LIVING", () => {
    assert.equal(classifyZhkStatus(N - 1, N), "NON_LIVING");
    assert.equal(classifyZhkStatus(0, N), "NON_LIVING");
  });

  it("граница N-1 / N / N+1 классифицируется монотонно", () => {
    assert.equal(classifyZhkStatus(N - 1, N), "NON_LIVING");
    assert.equal(classifyZhkStatus(N, N), "LIVING");
    assert.equal(classifyZhkStatus(N + 1, N), "LIVING");
  });

  it("порог 1: один активный житель → LIVING, ноль → NON_LIVING", () => {
    assert.equal(classifyZhkStatus(1, 1), "LIVING");
    assert.equal(classifyZhkStatus(0, 1), "NON_LIVING");
  });
});

describe("zhkActivityCron.getLivingZhkThreshold (конфигурируемый N)", () => {
  it("возвращает дефолт при отсутствии env", () => {
    delete process.env[LIVING_ZHK_THRESHOLD_ENV];
    assert.equal(getLivingZhkThreshold(), DEFAULT_LIVING_ZHK_MIN_WEEKLY_RESIDENTS);
  });

  it("читает положительное значение из env", () => {
    process.env[LIVING_ZHK_THRESHOLD_ENV] = "12";
    assert.equal(getLivingZhkThreshold(), 12);
    delete process.env[LIVING_ZHK_THRESHOLD_ENV];
  });

  it("возвращает дефолт при некорректном/неположительном env", () => {
    for (const bad of ["0", "-3", "abc", ""]) {
      process.env[LIVING_ZHK_THRESHOLD_ENV] = bad;
      assert.equal(getLivingZhkThreshold(), DEFAULT_LIVING_ZHK_MIN_WEEKLY_RESIDENTS);
    }
    delete process.env[LIVING_ZHK_THRESHOLD_ENV];
  });
});
