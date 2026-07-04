/**
 * Unit tests for AI_Design_Utility lead creation (Task 9.3).
 *
 * **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 20.1, 20.2** — оплатившая
 * утилиту сессия порождает лид в СУЩЕСТВУЮЩЕЙ таблице `leads` с признаком
 * источника `source='ai_utility'`, параметрами утилиты и ссылкой на
 * Design_Estimate в `marketplace_context`, приоритетным сигналом намерения
 * (`priority='hot'`) для CRM; параллельного пути заказов не создаётся.
 *
 * `buildAiUtilityLead` — чистый, DB-free шов: тесты детерминированы и не ходят
 * ни в БД, ни в сеть. Интеграция проверяется через инъекцию фейкового
 * `LeadCreator`.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  AiDesignSession,
  LeadCreator,
} from "../../src/lib/aiDesignUtility.js";

// `@workspace/db` кидает при загрузке модуля без DATABASE_URL. Тесты инъектируют
// фейковый пайплайн/leadCreator и ни одного запроса не выполняют — фиктивной
// строки достаточно (pg.Pool ленив). Выставляем ДО динамического импорта.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const {
  AiDesignUtility,
  InMemorySessionStore,
  buildAiUtilityLead,
  AI_UTILITY_LEAD_SOURCE,
  AI_UTILITY_LEAD_PRIORITY,
  DEFAULT_UTILITY_CLIENT_NAME,
  DEFAULT_UTILITY_SERVICE_TYPE,
} = await import("../../src/lib/aiDesignUtility.js");

describe("buildAiUtilityLead (Requirements 13.1, 13.2, 13.4, 20.1)", () => {
  const base = {
    phone: "+79991234567",
    areaM2: 42.5,
    style: "modern",
    estimateId: 77,
  };

  it("source = 'ai_utility' — признак источника платной утилиты (R13.1, R20.1)", () => {
    const lead = buildAiUtilityLead(base);
    assert.equal(lead.source, "ai_utility");
    assert.equal(lead.source, AI_UTILITY_LEAD_SOURCE);
  });

  it("marketplace_context содержит areaM2, style, estimateId (R13.2)", () => {
    const lead = buildAiUtilityLead(base);
    assert.deepEqual(lead.marketplaceContext, {
      areaM2: 42.5,
      style: "modern",
      estimateId: 77,
      priority: "hot",
    });
  });

  it("приоритетный сигнал намерения priority='hot' для CRM (R13.4)", () => {
    const lead = buildAiUtilityLead(base);
    const ctx = lead.marketplaceContext as { priority?: string };
    assert.equal(ctx.priority, "hot");
    assert.equal(ctx.priority, AI_UTILITY_LEAD_PRIORITY);
  });

  it("design_id связывает лид с Design_Estimate (R13.2)", () => {
    const lead = buildAiUtilityLead(base);
    assert.equal(lead.designId, 77);
  });

  it("использует собранный утилитой телефон и метраж (R12.2 → лид)", () => {
    const lead = buildAiUtilityLead(base);
    assert.equal(lead.clientPhone, "+79991234567");
    assert.equal(lead.area, "42.50");
  });

  it("обязательные поля без сбора у пользователя получают безопасные дефолты", () => {
    const lead = buildAiUtilityLead(base);
    assert.equal(lead.clientName, DEFAULT_UTILITY_CLIENT_NAME);
    assert.equal(lead.serviceType, DEFAULT_UTILITY_SERVICE_TYPE);
    // city/district NOT NULL в схеме — пустая строка сохраняет работу CRM-фильтров.
    assert.equal(lead.city, "");
    assert.equal(lead.district, "");
    assert.equal(lead.status, "new");
  });

  it("без estimateId → estimateId=null и design_id=null (черновой путь)", () => {
    const lead = buildAiUtilityLead({ phone: "+70000000000", areaM2: 30, style: "loft" });
    const ctx = lead.marketplaceContext as { estimateId: number | null };
    assert.equal(ctx.estimateId, null);
    assert.equal(lead.designId, null);
  });
});

// ── Интеграция: onPaymentConfirmed создаёт лид через инъектируемый шов ────────
function makeFakePipeline() {
  return {
    async enqueue() {
      return { designId: 42, designSlug: "apartment-modern" };
    },
    async fetchProduced() {
      return null;
    },
  };
}

function makeFakeLeadCreator() {
  let createCalls = 0;
  let lastValues: Parameters<LeadCreator["create"]>[0] | null = null;
  const leadCreator: LeadCreator = {
    async create(values) {
      createCalls += 1;
      lastValues = values;
      return { leadId: 555 };
    },
  };
  return { leadCreator, createCalls: () => createCalls, lastValues: () => lastValues };
}

describe("AiDesignUtility.onPaymentConfirmed → лид (Requirements 13.1, 13.3, 20.2)", () => {
  function seedPaidSession(store: InstanceType<typeof InMemorySessionStore>) {
    const session: AiDesignSession = {
      id: "pay-1",
      areaM2: 50,
      style: "scandinavian",
      phone: "+79995550000",
      paymentConfirmed: false,
      designId: null,
      designSlug: null,
      leadId: null,
      createdAt: new Date(),
    };
    store.set(session);
  }

  it("после подтверждения оплаты создаёт ровно один лид с source/context/priority", async () => {
    const store = new InMemorySessionStore();
    const leads = makeFakeLeadCreator();
    const util = new AiDesignUtility({ store, pipeline: makeFakePipeline(), leadCreator: leads.leadCreator });
    seedPaidSession(store);

    const res = await util.onPaymentConfirmed("pay-1");
    assert.equal(res.ok, true);
    assert.equal(leads.createCalls(), 1);
    if (res.ok) assert.equal(res.leadId, 555);

    const values = leads.lastValues();
    assert.ok(values);
    assert.equal(values?.source, "ai_utility");
    assert.equal(values?.clientPhone, "+79995550000");
    assert.deepEqual(values?.marketplaceContext, {
      areaM2: 50,
      style: "scandinavian",
      estimateId: 42, // designId из пайплайна
      priority: "hot",
    });
    assert.equal(values?.designId, 42);
  });

  it("повторный onPaymentConfirmed не порождает дубликат лида (idempotency, R20.2)", async () => {
    const store = new InMemorySessionStore();
    const leads = makeFakeLeadCreator();
    const util = new AiDesignUtility({ store, pipeline: makeFakePipeline(), leadCreator: leads.leadCreator });
    seedPaidSession(store);

    await util.onPaymentConfirmed("pay-1");
    await util.onPaymentConfirmed("pay-1");
    assert.equal(leads.createCalls(), 1);
  });

  it("сбой записи лида не роняет оплаченную генерацию (лид можно досоздать)", async () => {
    const store = new InMemorySessionStore();
    const failing: LeadCreator = {
      async create() {
        throw new Error("CRM недоступна");
      },
    };
    const util = new AiDesignUtility({ store, pipeline: makeFakePipeline(), leadCreator: failing });
    seedPaidSession(store);

    const res = await util.onPaymentConfirmed("pay-1");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.designId, 42);
      assert.equal(res.leadId, null);
    }
  });
});
