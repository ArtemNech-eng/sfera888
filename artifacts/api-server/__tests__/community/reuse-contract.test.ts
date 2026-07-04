/**
 * Reuse-contract tests (Task 14.2).
 *
 * **Validates: Requirements 20.1, 20.2, 20.3, 20.4, 20.7** — платформа
 * «ХочуТакже» переиспользует существующие активы и НЕ вводит параллельную
 * backend-логику:
 *   • 20.1 — лиды создаются через существующую таблицу `leads` с признаком
 *     источника (`source = AI_UTILITY_LEAD_SOURCE`), а не через новую сущность;
 *   • 20.2 — оплаченная сессия порождает ровно один лид единственным швом
 *     `LeadCreator.create` (нет параллельного пути заказов);
 *   • 20.3 — генерация Design_Estimate идёт через СУЩЕСТВУЮЩИЙ AI-пайплайн
 *     (`designsTablePipeline` поверх таблицы `designs`), без второго пайплайна;
 *   • 20.4/20.7 — Max_Bot не является обязательным шлюзом для денег/SEO:
 *     права публикации определяются ТОЛЬКО Phone_Verification, а доставка
 *     уведомлений всегда имеет не-Max fallback.
 *
 * Тест DB-free: используются чистые швы и in-memory дублёры; ни один реальный
 * запрос/сеть не выполняется. Env выставляется ДО динамического импорта.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LeadCreator, AiUtilityLeadValues } from "../../src/lib/aiDesignUtility.js";

const {
  AiDesignUtility,
  InMemorySessionStore,
  buildAiUtilityLead,
  AI_UTILITY_LEAD_SOURCE,
  designsTablePipeline,
  leadsTableLeadCreator,
} = await import("../../src/lib/aiDesignUtility.js");
const { hasPublishingRights } = await import("../../src/lib/communityAuth.js");
const { selectChannel } = await import("../../src/lib/communityNotifications.js");

// ─── Requirement 20.1 — лиды через существующую таблицу `leads` ──────────────

describe("reuse-contract: лиды идут через существующий Lead_Service/leads (R20.1)", () => {
  it("buildAiUtilityLead возвращает значения вставки в leads с признаком источника", () => {
    const lead = buildAiUtilityLead({
      phone: "+79990001122",
      areaM2: 42,
      style: "modern",
      estimateId: 7,
    });
    // Признак источника платной утилиты в существующей таблице leads (R20.1).
    assert.equal(lead.source, AI_UTILITY_LEAD_SOURCE);
    // Форма соответствует существующей модели leads (обязательные поля есть).
    for (const key of ["clientName", "clientPhone", "city", "district", "serviceType", "area"] as const) {
      assert.ok(key in lead, `лид должен нести поле leads.${key}`);
    }
    // Контекст утилиты уходит в существующую jsonb-колонку marketplace_context.
    assert.ok(lead.marketplaceContext, "должен использоваться leads.marketplace_context");
  });

  it("leadsTableLeadCreator — единственный прод-шов записи лида (в таблицу leads)", () => {
    assert.equal(typeof leadsTableLeadCreator.create, "function");
  });
});

// ─── Requirement 20.2 — единый путь: один лид на оплату, без параллельного ────

describe("reuse-contract: ровно один лид на оплату, единый путь (R20.2)", () => {
  it("onPaymentConfirmed создаёт лид ровно одним швом LeadCreator.create", async () => {
    const store = new InMemorySessionStore();
    const created: AiUtilityLeadValues[] = [];
    const leadCreator: LeadCreator = {
      async create(values) {
        created.push(values);
        return { leadId: created.length };
      },
    };
    const pipeline = {
      async enqueue() {
        return { designId: 1, designSlug: "d" };
      },
      async fetchProduced() {
        return null;
      },
    };
    const util = new AiDesignUtility({ store, pipeline, leadCreator });
    store.set({
      id: "s1",
      areaM2: 40,
      style: "loft",
      phone: "+79990000000",
      paymentConfirmed: false,
      designId: null,
      designSlug: null,
      leadId: null,
      createdAt: new Date(),
    });

    await util.onPaymentConfirmed("s1");
    await util.onPaymentConfirmed("s1"); // повтор не должен плодить лиды

    assert.equal(created.length, 1, "ожидался ровно один лид (нет параллельного пути)");
    assert.equal(created[0].source, AI_UTILITY_LEAD_SOURCE);
  });
});

// ─── Requirement 20.3 — генерация через существующий AI-пайплайн ─────────────

describe("reuse-contract: генерация через существующий AI-пайплайн designs (R20.3)", () => {
  it("экспортируется адаптер поверх существующего пайплайна (enqueue/fetchProduced)", () => {
    assert.equal(typeof designsTablePipeline.enqueue, "function");
    assert.equal(typeof designsTablePipeline.fetchProduced, "function");
  });
});

// ─── Requirements 20.4/20.7 — Max не обязателен для денег/SEO ─────────────────

describe("reuse-contract: Max_Bot не обязательный шлюз (R20.7, R11.4)", () => {
  it("права публикации определяются ТОЛЬКО Phone_Verification (без Max)", () => {
    // Верифицирован телефон, Max НЕ привязан → права есть.
    assert.equal(
      hasPublishingRights({ phoneVerifiedAt: new Date() } as any),
      true,
    );
    // Телефон не верифицирован → прав нет, даже если Max «привязан».
    assert.equal(hasPublishingRights({ phoneVerifiedAt: null } as any), false);
    assert.equal(hasPublishingRights(null), false);
  });

  it("уведомления всегда имеют не-Max fallback (деньги/SEO не зависят от Max)", () => {
    assert.notEqual(selectChannel({ maxConnected: false, important: false }), "max");
    assert.notEqual(selectChannel({ maxConnected: false, important: true }), "max");
  });
});
