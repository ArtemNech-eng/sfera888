/**
 * Unit tests for Auth_Service level-1 public read guard `checkOperationalAccess`
 * (Task 8.1).
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4** — публичное community-чтение
 * доступно анониму и поисковым роботам БЕЗ аутентификации и без Max, при этом
 * платформа ВПРАВЕ отказать анониму при действующих операционных ограничениях
 * (ограничение частоты запросов, режим обслуживания, решение модерации).
 *
 * Логика чистая и детерминированная — сеть/таймеры не используются.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  checkOperationalAccess,
  isMaintenanceModeEnabled,
} from "../../src/lib/communityPublicAccess.js";

describe("communityPublicAccess.checkOperationalAccess (Requirement 9)", () => {
  it("по умолчанию разрешает анонимное чтение без auth/Max (R9.1, R9.2, R9.3)", () => {
    // Пустой контекст: ограничения не действуют, аутентификация не требуется.
    const result = checkOperationalAccess({});
    assert.equal(result.allow, true);
  });

  it("явно отсутствующие ограничения → доступ разрешён", () => {
    const result = checkOperationalAccess({
      maintenanceMode: false,
      rateLimited: false,
      moderationBlocked: false,
    });
    assert.equal(result.allow, true);
  });

  it("режим обслуживания → отказ 503 с retryable=true (R9.4)", () => {
    const result = checkOperationalAccess({ maintenanceMode: true });
    assert.equal(result.allow, false);
    if (result.allow === false) {
      assert.equal(result.reason, "maintenance");
      assert.equal(result.status, 503);
      assert.equal(result.retryable, true);
    }
  });

  it("ограничение частоты запросов → отказ 429 с retryable=true (R9.4)", () => {
    const result = checkOperationalAccess({ rateLimited: true });
    assert.equal(result.allow, false);
    if (result.allow === false) {
      assert.equal(result.reason, "rate_limited");
      assert.equal(result.status, 429);
      assert.equal(result.retryable, true);
    }
  });

  it("решение модерации → отказ 403 с retryable=false (R9.4)", () => {
    const result = checkOperationalAccess({ moderationBlocked: true });
    assert.equal(result.allow, false);
    if (result.allow === false) {
      assert.equal(result.reason, "moderation_block");
      assert.equal(result.status, 403);
      assert.equal(result.retryable, false);
    }
  });

  it("детерминированный приоритет: обслуживание важнее модерации и rate-limit", () => {
    const result = checkOperationalAccess({
      maintenanceMode: true,
      moderationBlocked: true,
      rateLimited: true,
    });
    assert.equal(result.allow, false);
    if (result.allow === false) {
      assert.equal(result.reason, "maintenance");
    }
  });

  it("детерминированный приоритет: модерация важнее rate-limit", () => {
    const result = checkOperationalAccess({
      moderationBlocked: true,
      rateLimited: true,
    });
    assert.equal(result.allow, false);
    if (result.allow === false) {
      assert.equal(result.reason, "moderation_block");
    }
  });

  it("maintenanceMode=undefined → значение берётся из окружения", () => {
    const prev = process.env.COMMUNITY_MAINTENANCE_MODE;
    try {
      process.env.COMMUNITY_MAINTENANCE_MODE = "true";
      const denied = checkOperationalAccess({});
      assert.equal(denied.allow, false);
      if (denied.allow === false) assert.equal(denied.reason, "maintenance");

      process.env.COMMUNITY_MAINTENANCE_MODE = "0";
      const allowed = checkOperationalAccess({});
      assert.equal(allowed.allow, true);
    } finally {
      if (prev === undefined) delete process.env.COMMUNITY_MAINTENANCE_MODE;
      else process.env.COMMUNITY_MAINTENANCE_MODE = prev;
    }
  });
});

describe("communityPublicAccess.isMaintenanceModeEnabled", () => {
  it("truthy-значения включают режим обслуживания (регистр не важен)", () => {
    for (const v of ["1", "true", "TRUE", "yes", "On", " on "]) {
      assert.equal(
        isMaintenanceModeEnabled({ COMMUNITY_MAINTENANCE_MODE: v } as NodeJS.ProcessEnv),
        true,
        `expected "${v}" to enable maintenance mode`,
      );
    }
  });

  it("отсутствие переменной или иные значения → обслуживание выключено", () => {
    assert.equal(isMaintenanceModeEnabled({} as NodeJS.ProcessEnv), false);
    for (const v of ["0", "false", "no", "off", "", "maybe"]) {
      assert.equal(
        isMaintenanceModeEnabled({ COMMUNITY_MAINTENANCE_MODE: v } as NodeJS.ProcessEnv),
        false,
        `expected "${v}" to keep maintenance mode disabled`,
      );
    }
  });
});
