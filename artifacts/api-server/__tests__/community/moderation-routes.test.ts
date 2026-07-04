/**
 * Unit tests for Community Moderation routes (Task 7.3).
 *
 * **Validates: Requirements 19.3, 19.4** — очередь тем на рассмотрение,
 * применение модерационных действий и чтение журнала. Дополнительно
 * закрепляют смежное поведение: журнал каждого действия несёт `moderatorId` и
 * `reason` (R19.4), спам блокируется (R19.5), чувствительный контент
 * переносится в защищённый слой / снимается с публикации (R19.2), а также
 * входную валидацию маршрутов.
 *
 * Хендлеры и чистые функции прогоняются напрямую с фейковыми зависимостями и
 * mock req/res — без БД и без поднятия HTTP-сервера.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  ModerationRouterDeps,
  ApplyActionInput,
  ApplyActionResult,
  ListLogQuery,
} from "../../src/routes/community/moderation.js";
import type { CommunityThread, CommunityModerationLog } from "@workspace/db";

// `@workspace/db` кидает при загрузке модуля без DATABASE_URL. Тестируемая
// логика маршрутов чистая (зависимости инъектируются), поэтому даём фиктивный
// URL исключительно чтобы пройти импорт, и подгружаем модуль динамически.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const {
  makeHandlers,
  mapActionToThreadState,
  parseModerationAction,
  resolveModeratorId,
  parseLimit,
  parsePositiveInt,
} = await import("../../src/routes/community/moderation.js");

// ─── Тестовые дублёры ────────────────────────────────────────────────────────

/** Mock Response, захватывающий статус и тело. */
function mockRes() {
  const res: {
    statusCode: number;
    body: unknown;
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

/** Минимальный mock Request. */
function mockReq(opts: {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  user?: unknown;
}): any {
  return {
    params: opts.params ?? {},
    query: opts.query ?? {},
    body: opts.body,
    user: opts.user,
  };
}

function makeThread(over: Partial<CommunityThread> = {}): CommunityThread {
  return {
    id: 1,
    zone: "sosedi",
    scope: "zhk",
    cityId: null,
    zhkId: 42,
    specialtyId: null,
    isLocal: false,
    category: "developer_defect",
    title: "Заголовок",
    body: "Текст темы",
    authorAccountId: 100,
    isSeeded: false,
    visibility: "public",
    moderationStatus: "queued",
    lastActivityAt: new Date("2026-02-01T00:00:00Z"),
    createdAt: new Date("2026-02-01T00:00:00Z"),
    ...over,
  } as CommunityThread;
}

function makeLog(over: Partial<CommunityModerationLog> = {}): CommunityModerationLog {
  return {
    id: 1,
    targetType: "thread",
    targetId: 1,
    action: "hide",
    reason: "нарушение",
    moderatorId: 9,
    createdAt: new Date("2026-02-02T00:00:00Z"),
    ...over,
  } as CommunityModerationLog;
}

/** Собрать deps с разумными дефолтами и точечными переопределениями. */
function makeDeps(overrides: Partial<ModerationRouterDeps> = {}): ModerationRouterDeps {
  return {
    async listQueue() {
      return [makeThread()];
    },
    async applyAction(input: ApplyActionInput): Promise<ApplyActionResult> {
      const state = mapActionToThreadState(input.action);
      return {
        status: "applied",
        thread: makeThread({
          id: input.threadId,
          visibility: state.visibility,
          moderationStatus: state.moderationStatus,
        }),
        log: makeLog({
          targetId: input.threadId,
          action: state.logAction,
          reason: input.reason,
          moderatorId: input.moderatorId,
        }),
      };
    },
    async listLog() {
      return [makeLog()];
    },
    ...overrides,
  };
}

const OPERATOR = { id: 9, role: "lead_operator" };

// ─── Чистые функции ──────────────────────────────────────────────────────────

describe("parseModerationAction", () => {
  it("принимает валидные действия (регистронезависимо, с пробелами)", () => {
    assert.equal(parseModerationAction("allow"), "allow");
    assert.equal(parseModerationAction("RESTRICT"), "restrict");
    assert.equal(parseModerationAction("  unpublish "), "unpublish");
    assert.equal(parseModerationAction("block"), "block");
  });

  it("отклоняет неизвестные/нестроковые значения", () => {
    assert.equal(parseModerationAction("delete"), null);
    assert.equal(parseModerationAction(""), null);
    assert.equal(parseModerationAction(123), null);
    assert.equal(parseModerationAction(null), null);
    assert.equal(parseModerationAction(undefined), null);
  });
});

describe("mapActionToThreadState (R19.2, R19.5)", () => {
  it("allow → публичная видимость", () => {
    assert.deepEqual(mapActionToThreadState("allow"), {
      visibility: "public",
      moderationStatus: "allowed",
      logAction: "allow",
    });
  });

  it("restrict → перенос в защищённый слой (R19.2)", () => {
    assert.deepEqual(mapActionToThreadState("restrict"), {
      visibility: "protected",
      moderationStatus: "restricted",
      logAction: "move_protected",
    });
  });

  it("unpublish → снятие с публикации (R19.2)", () => {
    assert.deepEqual(mapActionToThreadState("unpublish"), {
      visibility: "hidden",
      moderationStatus: "unpublished",
      logAction: "hide",
    });
  });

  it("block → блокировка (R19.5)", () => {
    assert.deepEqual(mapActionToThreadState("block"), {
      visibility: "hidden",
      moderationStatus: "blocked",
      logAction: "block",
    });
  });
});

describe("resolveModeratorId", () => {
  it("извлекает положительный id из req.user", () => {
    assert.equal(resolveModeratorId({ user: { id: 9 } }), 9);
    assert.equal(resolveModeratorId({ user: { id: "12" } }), 12);
  });

  it("возвращает null при отсутствии/некорректном id", () => {
    assert.equal(resolveModeratorId({}), null);
    assert.equal(resolveModeratorId({ user: null }), null);
    assert.equal(resolveModeratorId({ user: { id: 0 } }), null);
    assert.equal(resolveModeratorId({ user: { id: -1 } }), null);
    assert.equal(resolveModeratorId({ user: { id: "x" } }), null);
  });
});

describe("parseLimit / parsePositiveInt", () => {
  it("parseLimit нормализует и ограничивает диапазон", () => {
    assert.equal(parseLimit("10", 50), 10);
    assert.equal(parseLimit("нет", 50), 50);
    assert.equal(parseLimit("-5", 50), 50);
    assert.equal(parseLimit("99999", 50), 200); // MAX_LIMIT
  });

  it("parsePositiveInt принимает только положительные целые", () => {
    assert.equal(parsePositiveInt("42"), 42);
    assert.equal(parsePositiveInt("0"), null);
    assert.equal(parsePositiveInt("2.5"), null);
    assert.equal(parsePositiveInt("abc"), null);
  });
});

// ─── GET /queue (Requirement 19.3) ───────────────────────────────────────────

describe("GET /queue — очередь модерации (R19.3)", () => {
  it("возвращает пункты очереди со статусом 200", async () => {
    let capturedLimit = -1;
    const h = makeHandlers(
      makeDeps({
        async listQueue(limit) {
          capturedLimit = limit;
          return [makeThread({ id: 5, moderationStatus: "queued" })];
        },
      }),
    );
    const res = mockRes();
    await h.getQueue(mockReq({ query: { limit: "25" }, user: OPERATOR }), res as any);

    assert.equal(res.statusCode, 200);
    const body = res.body as any;
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].id, 5);
    assert.equal(capturedLimit, 25);
  });

  it("пустая очередь → 200 с items:[] (не ошибка)", async () => {
    const h = makeHandlers(makeDeps({ async listQueue() { return []; } }));
    const res = mockRes();
    await h.getQueue(mockReq({ user: OPERATOR }), res as any);

    assert.equal(res.statusCode, 200);
    assert.deepEqual((res.body as any).items, []);
  });
});

// ─── POST /threads/:id/action (Requirements 19.2, 19.4, 19.5) ────────────────

describe("POST /threads/:id/action — применение действия (R19.4)", () => {
  it("применяет действие и журналирует с moderatorId + reason (R19.4)", async () => {
    let captured: ApplyActionInput | null = null;
    const h = makeHandlers(
      makeDeps({
        async applyAction(input) {
          captured = input;
          const state = mapActionToThreadState(input.action);
          return {
            status: "applied",
            thread: makeThread({ id: input.threadId, moderationStatus: state.moderationStatus }),
            log: makeLog({
              targetId: input.threadId,
              action: state.logAction,
              reason: input.reason,
              moderatorId: input.moderatorId,
            }),
          };
        },
      }),
    );
    const res = mockRes();
    await h.applyThreadAction(
      mockReq({
        params: { id: "7" },
        body: { action: "unpublish", reason: "персональные данные" },
        user: OPERATOR,
      }),
      res as any,
    );

    assert.equal(res.statusCode, 200);
    const body = res.body as any;
    assert.equal(body.status, "applied");
    // Действие журналируется с идентификатором модератора и причиной (R19.4).
    assert.equal(captured!.threadId, 7);
    assert.equal(captured!.action, "unpublish");
    assert.equal(captured!.reason, "персональные данные");
    assert.equal(captured!.moderatorId, 9);
    assert.equal(body.log.moderatorId, 9);
    assert.equal(body.log.reason, "персональные данные");
  });

  it("блокировка спама → thread.moderationStatus=blocked (R19.5)", async () => {
    const h = makeHandlers(makeDeps());
    const res = mockRes();
    await h.applyThreadAction(
      mockReq({
        params: { id: "3" },
        body: { action: "block", reason: "спам" },
        user: OPERATOR,
      }),
      res as any,
    );

    assert.equal(res.statusCode, 200);
    assert.equal((res.body as any).thread.moderationStatus, "blocked");
    assert.equal((res.body as any).log.action, "block");
  });

  it("невалидный id темы → 400", async () => {
    const h = makeHandlers(makeDeps());
    const res = mockRes();
    await h.applyThreadAction(
      mockReq({ params: { id: "abc" }, body: { action: "allow", reason: "ok" }, user: OPERATOR }),
      res as any,
    );
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as any).error, "invalid_thread_id");
  });

  it("невалидное действие → 400", async () => {
    const h = makeHandlers(makeDeps());
    const res = mockRes();
    await h.applyThreadAction(
      mockReq({ params: { id: "1" }, body: { action: "nuke", reason: "ok" }, user: OPERATOR }),
      res as any,
    );
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as any).error, "invalid_action");
  });

  it("пустая причина → 400 reason_required (журнал требует причину, R19.4)", async () => {
    const h = makeHandlers(makeDeps());
    const res = mockRes();
    await h.applyThreadAction(
      mockReq({ params: { id: "1" }, body: { action: "allow", reason: "   " }, user: OPERATOR }),
      res as any,
    );
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as any).error, "reason_required");
  });

  it("не удалось определить модератора → 401", async () => {
    const h = makeHandlers(makeDeps());
    const res = mockRes();
    await h.applyThreadAction(
      mockReq({ params: { id: "1" }, body: { action: "allow", reason: "ok" } }),
      res as any,
    );
    assert.equal(res.statusCode, 401);
  });

  it("тема не найдена → 404", async () => {
    const h = makeHandlers(makeDeps({ async applyAction() { return { status: "not_found" }; } }));
    const res = mockRes();
    await h.applyThreadAction(
      mockReq({ params: { id: "999" }, body: { action: "allow", reason: "ok" }, user: OPERATOR }),
      res as any,
    );
    assert.equal(res.statusCode, 404);
    assert.equal((res.body as any).error, "not_found");
  });
});

// ─── GET /log (Requirement 19.4) ─────────────────────────────────────────────

describe("GET /log — журнал модерации (R19.4)", () => {
  it("возвращает записи журнала со статусом 200", async () => {
    const h = makeHandlers(makeDeps());
    const res = mockRes();
    await h.getLog(mockReq({ user: OPERATOR }), res as any);

    assert.equal(res.statusCode, 200);
    assert.equal((res.body as any).items.length, 1);
    assert.equal((res.body as any).items[0].moderatorId, 9);
  });

  it("прокидывает фильтры targetType/targetId и limit", async () => {
    let captured: ListLogQuery | null = null;
    const h = makeHandlers(
      makeDeps({
        async listLog(query) {
          captured = query;
          return [];
        },
      }),
    );
    const res = mockRes();
    await h.getLog(
      mockReq({ query: { targetType: "thread", targetId: "42", limit: "10" }, user: OPERATOR }),
      res as any,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(captured!.targetType, "thread");
    assert.equal(captured!.targetId, 42);
    assert.equal(captured!.limit, 10);
  });
});
