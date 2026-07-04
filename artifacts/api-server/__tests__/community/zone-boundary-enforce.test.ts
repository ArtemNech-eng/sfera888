/**
 * Unit tests for ModerationService.enforceZoneBoundary (Task 7.2).
 *
 * **Validates: Requirements 8.2** — рекламное предложение услуг мастера в зоне
 * соседей блокируется, и ТОЛЬКО при успешной блокировке автор уведомляется о
 * нарушении границы зон.
 *
 * Тестируем ОРКЕСТРАЦИЮ enforceZoneBoundary (детект → блок → уведомление) через
 * инъекцию зависимостей (`deps`), поэтому БД и каналы уведомлений не
 * задействованы. Качество самого детекта рекламы (регэкспы) — зона
 * ответственности `zoneService.isMasterAdInSosedi` и его собственных тестов;
 * здесь мы моделируем результат детекта (`detect: () => true/false`), чтобы
 * проверить именно логику гейтинга (уведомление только при успешной блокировке).
 * Негативные кейсы дополнительно прогоняются через РЕАЛЬНЫЙ детект.
 *
 * `@workspace/db` кидает при загрузке модуля без DATABASE_URL; тест не делает
 * запросов, поэтому фиктивной строки достаточно (pg.Pool ленивый). Импорт —
 * динамический, чтобы env успел выставиться до вычисления импортов модуля.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { enforceZoneBoundary } = await import("../../src/lib/moderationService.js");

// Явно рекламный текст услуг мастера (сработает MASTER_AD_PATTERNS).
const MASTER_AD_POST = {
  id: 101,
  zone: "sosedi",
  title: "Ремонт под ключ недорого",
  body: "Выполним любой ремонт квартир, услуги плиточника. Звоните!",
  authorAccountId: 7,
};

// Обычная соседская тема — не реклама.
const NEIGHBORLY_POST = {
  id: 102,
  zone: "sosedi",
  title: "Одолжите дрель на вечер",
  body: "Соседи, кто может одолжить перфоратор на пару часов? Верну сегодня же.",
  authorAccountId: 8,
};

const MASTER_ACCOUNT = { id: 7, role: "master", phone: "+79990001122" };

describe("moderationService.enforceZoneBoundary (Requirement 8.2)", () => {
  it("реклама мастера в зоне соседей → blocked + notified", async () => {
    let blockCalled = false;
    let notifyCalled = false;

    const result = await enforceZoneBoundary(MASTER_AD_POST, MASTER_ACCOUNT, {
      detect: () => true, // детект классифицировал как рекламу мастера
      block: async () => {
        blockCalled = true;
        return true; // блокировка успешна
      },
      notifyAuthor: async () => {
        notifyCalled = true;
        return true; // уведомление доставлено
      },
    });

    assert.equal(result.blocked, true);
    assert.equal(result.notified, true);
    assert.equal(blockCalled, true);
    assert.equal(notifyCalled, true);
  });

  it("обычная соседская тема (не реклама, РЕАЛЬНЫЙ детект) → не блокируется и не уведомляет", async () => {
    let blockCalled = false;
    let notifyCalled = false;

    // Без переопределения detect — используется реальный isMasterAdInSosedi.
    const result = await enforceZoneBoundary(NEIGHBORLY_POST, MASTER_ACCOUNT, {
      block: async () => {
        blockCalled = true;
        return true;
      },
      notifyAuthor: async () => {
        notifyCalled = true;
        return true;
      },
    });

    assert.equal(result.blocked, false);
    assert.equal(result.notified, false);
    assert.equal(blockCalled, false, "блокировка не должна вызываться для не-рекламы");
    assert.equal(notifyCalled, false, "уведомление не должно вызываться для не-рекламы");
  });

  it("успех блокировки гейтит уведомление: block=false → notified=false, уведомление НЕ вызвано", async () => {
    let notifyCalled = false;

    const result = await enforceZoneBoundary(MASTER_AD_POST, MASTER_ACCOUNT, {
      detect: () => true,
      block: async () => false, // блокировка НЕ удалась
      notifyAuthor: async () => {
        notifyCalled = true;
        return true;
      },
    });

    assert.equal(result.blocked, false);
    assert.equal(result.notified, false);
    assert.equal(
      notifyCalled,
      false,
      "при неуспешной блокировке автор НЕ уведомляется (Requirement 8.2)",
    );
  });

  it("реклама в PRO-зоне (не sosedi, РЕАЛЬНЫЙ детект) → границы зон не нарушены, не блокируется", async () => {
    const proAd = { ...MASTER_AD_POST, zone: "pro_public" };
    // Реальный детект: короткое замыкание по zone !== 'sosedi' → false.
    const result = await enforceZoneBoundary(proAd, MASTER_ACCOUNT, {
      block: async () => true,
      notifyAuthor: async () => true,
    });
    assert.equal(result.blocked, false);
    assert.equal(result.notified, false);
  });

  it("блокировка удалась, но доставка уведомления не удалась → blocked=true, notified=false", async () => {
    const result = await enforceZoneBoundary(MASTER_AD_POST, MASTER_ACCOUNT, {
      detect: () => true,
      block: async () => true,
      notifyAuthor: async () => false, // доставка не удалась
    });
    assert.equal(result.blocked, true);
    assert.equal(result.notified, false);
  });

  it("сбой блокировки (throw) не пробрасывается → blocked=false, уведомление не вызвано", async () => {
    let notifyCalled = false;
    const result = await enforceZoneBoundary(MASTER_AD_POST, MASTER_ACCOUNT, {
      detect: () => true,
      block: async () => {
        throw new Error("db down");
      },
      notifyAuthor: async () => {
        notifyCalled = true;
        return true;
      },
    });
    assert.equal(result.blocked, false);
    assert.equal(result.notified, false);
    assert.equal(notifyCalled, false);
  });
});
