/**
 * Unit tests for Auth_Service level-3 Phone_Verification (Task 8.3).
 *
 * **Validates: Requirements 11.1, 11.2, 11.3, 11.4** — публикация в сообществе
 * создаёт Community_Account по Phone_Verification, права выдаются немедленно
 * после подтверждения кода, Max_Login опционален и никогда не обязателен, а
 * незавершённая верификация не даёт прав (черновик сохраняется в feed-слое).
 *
 * Хранилище кодов, доставка кода и репозиторий аккаунтов инъектируются, поэтому
 * тесты детерминированы и не ходят ни в SMS, ни в БД.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CommunityAccount } from "@workspace/db";
import type {
  CommunityAccountRepository,
  PhoneVerificationDeps,
} from "../../src/lib/communityAuth.js";

// `@workspace/db` кидает при загрузке модуля, если не задан DATABASE_URL. Эти
// тесты инъектируют фейковый репозиторий аккаунтов и не выполняют ни одного
// запроса, поэтому фиктивной строки подключения достаточно (`pg.Pool` ленив).
// Импорт модуля под тестом — динамический, чтобы env успел выставиться.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const {
  requestPhoneCode,
  confirmPhoneCode,
  linkMaxOptional,
  hasPublishingRights,
  createInMemoryCodeStore,
} = await import("../../src/lib/communityAuth.js");

/** Фейковый in-memory репозиторий аккаунтов (без БД). */
function createFakeAccounts(): CommunityAccountRepository & { rows: CommunityAccount[] } {
  const rows: CommunityAccount[] = [];
  let nextId = 1;
  const base = (phone: string): CommunityAccount =>
    ({
      id: nextId++,
      phone,
      phoneVerifiedAt: null,
      role: "resident",
      zhkId: null,
      maxUserId: null,
      createdAt: new Date(),
    }) as CommunityAccount;

  return {
    rows,
    async findByPhone(phone) {
      return rows.find((r) => r.phone === phone) ?? null;
    },
    async createVerified(phone, verifiedAt) {
      const row = base(phone);
      row.phoneVerifiedAt = verifiedAt;
      rows.push(row);
      return row;
    },
    async markVerified(accountId, verifiedAt) {
      const row = rows.find((r) => r.id === accountId)!;
      row.phoneVerifiedAt = verifiedAt;
      return row;
    },
    async linkMax(accountId, maxUserId) {
      const row = rows.find((r) => r.id === accountId)!;
      row.maxUserId = maxUserId;
      return row;
    },
  };
}

/** Собрать инъектируемые зависимости с перехватом отправляемого кода. */
function makeDeps(): { deps: PhoneVerificationDeps; sent: { code?: string } } {
  const sent: { code?: string } = {};
  const deps: PhoneVerificationDeps = {
    store: createInMemoryCodeStore(),
    accounts: createFakeAccounts(),
    sendCode: ({ code }) => {
      sent.code = code;
    },
  };
  return { deps, sent };
}

describe("communityAuth Phone_Verification (Requirement 11)", () => {
  it("confirmPhoneCode создаёт аккаунт и НЕМЕДЛЕННО выдаёт полные права (R11.1, R11.4)", async () => {
    const { deps, sent } = makeDeps();

    const req = await requestPhoneCode("+7 999 123-45-67", deps);
    assert.equal(req.ok, true);
    assert.ok(sent.code, "код должен быть доставлен через инъектируемый sender");

    const res = await confirmPhoneCode("+79991234567", sent.code!, deps);
    assert.equal(res.ok, true);
    if (res.ok) {
      // Права публикации выданы сразу: phoneVerifiedAt проставлен.
      assert.ok(res.account.phoneVerifiedAt != null);
      assert.equal(hasPublishingRights(res.account), true);
      // Max не требовался: maxUserId остаётся пустым, права всё равно есть (R11.4).
      assert.equal(res.account.maxUserId ?? null, null);
    }
  });

  it("неверифицированный аккаунт НЕ имеет прав → публикация отклоняется, черновик сохраняется (R11.3)", () => {
    const unverified = { phoneVerifiedAt: null } as CommunityAccount;
    assert.equal(hasPublishingRights(unverified), false);
    // null/undefined аккаунт (аноним) тоже без прав.
    assert.equal(hasPublishingRights(null), false);
    assert.equal(hasPublishingRights(undefined), false);
  });

  it("верифицированный аккаунт имеет права независимо от Max (R11.4)", () => {
    const verifiedNoMax = { phoneVerifiedAt: new Date(), maxUserId: null } as CommunityAccount;
    assert.equal(hasPublishingRights(verifiedNoMax), true);
  });

  it("Max_Login опционален и НЕ является условием прав публикации (R11.2, R11.4)", async () => {
    const { deps, sent } = makeDeps();
    await requestPhoneCode("+79991234567", deps);
    const res = await confirmPhoneCode("+79991234567", sent.code!, deps);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    // Права уже есть до какой-либо привязки Max.
    assert.equal(hasPublishingRights(res.account), true);

    // Привязка Max — опциональный бонус: не меняет права, только заполняет id.
    const linked = await linkMaxOptional(res.account.id, "max-42", deps);
    assert.equal(linked.maxUserId, "max-42");
    assert.equal(hasPublishingRights(linked), true);
    // phoneVerifiedAt не изменился привязкой Max.
    assert.deepEqual(linked.phoneVerifiedAt, res.account.phoneVerifiedAt);
  });

  it("неверный код → отказ, права не выдаются", async () => {
    const { deps } = makeDeps();
    await requestPhoneCode("+79991234567", deps);
    const res = await confirmPhoneCode("+79991234567", "000000-wrong", deps);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.reason, "code_invalid");
    }
  });

  it("подтверждение без запроса кода → отказ", async () => {
    const { deps } = makeDeps();
    const res = await confirmPhoneCode("+79991234567", "123456", deps);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.reason, "code_not_requested");
    }
  });

  it("истёкший код → отказ (детерминированное время)", async () => {
    const sent: { code?: string } = {};
    let clock = 1_000_000;
    const deps: PhoneVerificationDeps = {
      store: createInMemoryCodeStore(),
      accounts: createFakeAccounts(),
      sendCode: ({ code }) => {
        sent.code = code;
      },
      now: () => clock,
      codeTtlMs: 60_000,
    };
    await requestPhoneCode("+79991234567", deps);
    clock += 60_001; // за пределом TTL
    const res = await confirmPhoneCode("+79991234567", sent.code!, deps);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.reason, "code_expired");
    }
  });
});
