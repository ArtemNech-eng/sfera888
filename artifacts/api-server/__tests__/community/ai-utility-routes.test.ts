/**
 * Unit tests for Community AI_Design_Utility routes (Task 9.5).
 *
 * **Validates: Requirements 12.1, 12.3** — маршруты `/api/community/ai-utility`:
 *   • POST /start — сбор параметров + уровень 2 (телефон + Captcha) до оплаты;
 *   • POST /confirm-payment/:sessionId — подтверждение оплаты через шов
 *     `verifyPayment` (в проде — существующий Yandex Pay) и запуск генерации
 *     (12.3); без оплаты — гейт 402 (12.5);
 *   • GET /estimate/:sessionId — выдача Design_Estimate (12.4, 12.6).
 *
 * Хендлеры прогоняются напрямую с фейковыми зависимостями и mock req/res —
 * без БД, без оплаты и без AI-пайплайна.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { AiUtilityRouterDeps } from "../../src/routes/community/ai-utility.js";

// `@workspace/db` кидает при загрузке модуля без DATABASE_URL. Логика маршрутов
// чистая (зависимости инъектируются), поэтому даём фиктивный URL для импорта и
// подгружаем роутер динамически.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { makeHandlers, parseStartBody } = await import(
  "../../src/routes/community/ai-utility.js"
);

// ─── Тестовые дублёры ────────────────────────────────────────────────────────

function mockRes() {
  const res: {
    statusCode: number;
    body: any;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function mockReq(opts: { params?: Record<string, string>; body?: unknown }): any {
  return { params: opts.params ?? {}, body: opts.body };
}

/** Собрать deps с разумными дефолтами и точечными переопределениями. */
function makeDeps(overrides: Partial<AiUtilityRouterDeps> = {}): AiUtilityRouterDeps {
  return {
    utility: {
      async startSession() {
        return { ok: true, sessionId: "sess-1", session: {} as any };
      },
      async onPaymentConfirmed() {
        return {
          ok: true,
          sessionId: "sess-1",
          designId: 42,
          designSlug: "apartment-modern",
          leadId: 555,
        };
      },
      async getEstimate() {
        return { status: "draft", visualizations: [], materials: [], estimate: [] } as any;
      },
    },
    async verifyPayment() {
      return true;
    },
    ...overrides,
  };
}

// ─── parseStartBody ──────────────────────────────────────────────────────────

describe("parseStartBody", () => {
  it("извлекает и нормализует поля запуска", () => {
    const b = parseStartBody({ areaM2: "42.5", style: "modern", phone: "+79990000000", captchaToken: "t" });
    assert.equal(b.areaM2, 42.5);
    assert.equal(b.style, "modern");
    assert.equal(b.phone, "+79990000000");
    assert.equal(b.captchaToken, "t");
  });

  it("нечисловой метраж → NaN; отсутствующие строки → пустые", () => {
    const b = parseStartBody({ areaM2: "abc" });
    assert.ok(Number.isNaN(b.areaM2));
    assert.equal(b.style, "");
    assert.equal(b.phone, "");
    assert.equal(b.captchaToken, "");
  });
});

// ─── POST /start (Requirements 12.2, 10.x) ───────────────────────────────────

describe("POST /start — сбор параметров + уровень 2 (R12.2)", () => {
  it("успех → 201 с sessionId", async () => {
    const h = makeHandlers(makeDeps());
    const res = mockRes();
    await h.start(
      mockReq({ body: { areaM2: 40, style: "loft", phone: "+79990000000", captchaToken: "t" } }),
      res as any,
    );
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.sessionId, "sess-1");
  });

  it("провал Captcha → 403 с retry (R10.3)", async () => {
    const h = makeHandlers(
      makeDeps({
        utility: {
          async startSession() {
            return { ok: false, reason: "captcha_failed", retry: true };
          },
          async onPaymentConfirmed() {
            return { ok: false, reason: "session_not_found" };
          },
          async getEstimate() {
            return null;
          },
        },
      }),
    );
    const res = mockRes();
    await h.start(mockReq({ body: {} }), res as any);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, "captcha_failed");
    assert.equal(res.body.retry, true);
  });

  it("невалидные параметры → 400", async () => {
    const h = makeHandlers(
      makeDeps({
        utility: {
          async startSession() {
            return { ok: false, reason: "area_invalid", retry: false };
          },
          async onPaymentConfirmed() {
            return { ok: false, reason: "session_not_found" };
          },
          async getEstimate() {
            return null;
          },
        },
      }),
    );
    const res = mockRes();
    await h.start(mockReq({ body: { areaM2: -1 } }), res as any);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "area_invalid");
  });
});

// ─── POST /confirm-payment/:sessionId (Requirements 12.3, 12.5) ──────────────

describe("POST /confirm-payment — гейт оплаты и запуск генерации (R12.3, R12.5)", () => {
  it("оплата подтверждена → 200 с designId/leadId (R12.3)", async () => {
    let confirmedFor: string | null = null;
    const h = makeHandlers(
      makeDeps({
        verifyPayment: async (id) => {
          confirmedFor = id;
          return true;
        },
      }),
    );
    const res = mockRes();
    await h.confirmPayment(mockReq({ params: { sessionId: "sess-1" } }), res as any);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.designId, 42);
    assert.equal(res.body.leadId, 555);
    assert.equal(confirmedFor, "sess-1");
  });

  it("оплата НЕ подтверждена → 402 и генерация не запускается (R12.5)", async () => {
    let generationCalled = false;
    const h = makeHandlers(
      makeDeps({
        verifyPayment: async () => false,
        utility: {
          async startSession() {
            return { ok: true, sessionId: "s", session: {} as any };
          },
          async onPaymentConfirmed() {
            generationCalled = true;
            return { ok: true, sessionId: "s", designId: 1, designSlug: "x", leadId: null };
          },
          async getEstimate() {
            return null;
          },
        },
      }),
    );
    const res = mockRes();
    await h.confirmPayment(mockReq({ params: { sessionId: "sess-1" } }), res as any);

    assert.equal(res.statusCode, 402);
    assert.equal(res.body.error, "payment_not_confirmed");
    assert.equal(generationCalled, false, "без подтверждённой оплаты генерация не должна запускаться");
  });

  it("оплата есть, но сессия не найдена → 404", async () => {
    const h = makeHandlers(
      makeDeps({
        verifyPayment: async () => true,
        utility: {
          async startSession() {
            return { ok: true, sessionId: "s", session: {} as any };
          },
          async onPaymentConfirmed() {
            return { ok: false, reason: "session_not_found" };
          },
          async getEstimate() {
            return null;
          },
        },
      }),
    );
    const res = mockRes();
    await h.confirmPayment(mockReq({ params: { sessionId: "missing" } }), res as any);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, "session_not_found");
  });
});

// ─── GET /estimate/:sessionId (Requirements 12.4, 12.6) ──────────────────────

describe("GET /estimate — выдача Design_Estimate (R12.4, R12.6)", () => {
  it("сессия есть → 200 с estimate", async () => {
    const h = makeHandlers(
      makeDeps({
        utility: {
          async startSession() {
            return { ok: true, sessionId: "s", session: {} as any };
          },
          async onPaymentConfirmed() {
            return { ok: false, reason: "session_not_found" };
          },
          async getEstimate() {
            return {
              status: "generated",
              visualizations: [{ url: "u", label: "l", position: 1 }],
              materials: [],
              estimate: [{ category: "Отделка", amountKopeks: 100 }],
            } as any;
          },
        },
      }),
    );
    const res = mockRes();
    await h.getEstimate(mockReq({ params: { sessionId: "sess-1" } }), res as any);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.estimate.status, "generated");
    assert.equal(res.body.estimate.visualizations.length, 1);
  });

  it("сессии нет → 404", async () => {
    const h = makeHandlers(
      makeDeps({
        utility: {
          async startSession() {
            return { ok: true, sessionId: "s", session: {} as any };
          },
          async onPaymentConfirmed() {
            return { ok: false, reason: "session_not_found" };
          },
          async getEstimate() {
            return null;
          },
        },
      }),
    );
    const res = mockRes();
    await h.getEstimate(mockReq({ params: { sessionId: "missing" } }), res as any);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, "not_found");
  });
});
