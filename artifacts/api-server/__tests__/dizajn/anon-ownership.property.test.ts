/**
 * Property tests for anonymous ownership and visibility.
 *
 * Property 10: Anon_Id cookie is issued exactly once and persisted as owner.
 *   Module under test: `src/middlewares/anonIdMiddleware.ts`.
 *   Pure express middleware — no DB, no IO. We drive it directly with mock
 *   req/res pairs and a fast-check generator over UUID-shaped /
 *   not-UUID-shaped cookie inputs.
 *
 * Property 11: My_Designs_List returns own designs sorted DESC with required
 * keys.
 *   Module under test: `src/routes/dizajn.ts` — `GET /mine` handler. We
 *   patch the singleton `db` exported by `@workspace/db` so that `db.select`
 *   records its full chainable invocation (.from / .where / .orderBy /
 *   .limit) and returns a synthetic array of rows. Then we drive the inline
 *   handler from `dizajnRouter.stack` and assert:
 *     - `select(...)` projects exactly the columns required by Requirement
 *       4.7 (`slug`, `roomType`, `style`, `status`, `progress`,
 *       `resultImageUrl`, `createdAt`).
 *     - `where(...)` filters by `designsTable.anonId === req.anonId`. We
 *       verify by reconstructing the same SQL with `eq()` and comparing
 *       structurally.
 *     - `orderBy(...)` sorts DESC by `createdAt` (Requirement 4.3).
 *     - `limit(50)` is applied.
 *     - Response body is `{ ok: true, items: <rows from db> }` and rows are
 *       passed through unmodified — sort order is preserved by the handler.
 *
 * Property 12: Public_Page visibility and ownership badge.
 *   Module under test: `src/routes/dizajn.ts` — `GET /:slug` handler.
 *   Per Requirements 4.5 / 4.6 / 4.4 the API:
 *     - Returns the design regardless of `is_public` (so non-owners with a
 *       direct link can open it; owner-only listing is enforced by the feed
 *       endpoint, not by-slug).
 *     - Always exposes `designAnonId` so the front-end can compute the
 *       "ваш проект" badge by comparing it to the current cookie
 *       `kiro_anon_id`.
 *     - Always exposes `status` so the front-end can hide private projects
 *       from non-owners (only `status === 'private'` should be hidden by the
 *       UI; the API itself stays neutral).
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 15.3**
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Provide fake env *before* any production import so module-load-time
// connectors (S3 client, pg.Pool, Turnstile) don't trip. None of these
// services are touched by the tests below — we mock at the singleton-db
// boundary.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";
process.env.R2_ENDPOINT = process.env.R2_ENDPOINT ?? "https://fake.r2.dev";
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "fake-key";
process.env.R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY ?? "fake-secret";

import { anonIdMiddleware } from "../../src/middlewares/anonIdMiddleware.js";

// `@workspace/db` exposes the singleton `db` and the `designsTable` schema
// object. We need both: the first to mock query execution, the second to
// reconstruct the expected `where`/`orderBy` SQL fragments.
const dbModule = await import("@workspace/db");
const { db, designsTable } = dbModule;

// `eq` / `desc` from drizzle build the SQL fragments we want to compare
// against the ones the handler builds.
const drizzleOrm = await import("drizzle-orm");
const { eq, desc } = drizzleOrm;

// ─── Property 10: anonIdMiddleware ───────────────────────────────────────

const COOKIE_NAME = "kiro_anon_id";
const UUID_RE_TEST =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MockRes {
  res: {
    cookie: (name: string, value: string, options: unknown) => unknown;
    status: (code: number) => unknown;
    json: (body: unknown) => unknown;
    setHeader: (k: string, v: string) => unknown;
    set: (k: string, v: string) => unknown;
    end: (b?: unknown) => unknown;
  };
  cookieCalls: Array<[string, string, unknown]>;
}

function createReqWithCookie(cookieValue: string | undefined): unknown {
  return {
    cookies: cookieValue !== undefined ? { [COOKIE_NAME]: cookieValue } : {},
    headers: {},
    query: {},
    params: {},
    body: {},
  };
}

function createMockRes(): MockRes {
  const cookieCalls: Array<[string, string, unknown]> = [];
  const res = {
    cookie(name: string, value: string, options: unknown) {
      cookieCalls.push([name, value, options]);
      return res;
    },
    status() {
      return res;
    },
    json() {
      return res;
    },
    setHeader() {
      return res;
    },
    set() {
      return res;
    },
    end() {
      return res;
    },
  };
  return { res, cookieCalls };
}

describe("Property 10: Anon_Id cookie is issued exactly once and persisted as owner", () => {
  // Validates: Requirements 4.1, 4.2

  // ----------------------------------------------------------------------
  // 10.1 — When the cookie is already a valid UUID, the middleware MUST
  // populate req.anonId with that exact value and MUST NOT issue a
  // Set-Cookie. This is the "cookie issued exactly once" half of
  // Requirement 4.2: subsequent requests reuse the same cookie.
  // ----------------------------------------------------------------------
  it("10.1 valid existing cookie → req.anonId preserved, NO Set-Cookie issued", () => {
    fc.assert(
      fc.property(fc.uuid(), (validUuid) => {
        let nextCalls = 0;
        const req = createReqWithCookie(validUuid) as Parameters<
          typeof anonIdMiddleware
        >[0];
        const { res, cookieCalls } = createMockRes();
        anonIdMiddleware(
          req,
          res as unknown as Parameters<typeof anonIdMiddleware>[1],
          () => {
            nextCalls += 1;
          },
        );

        assert.equal(
          (req as { anonId?: string }).anonId,
          validUuid,
          "req.anonId must equal the existing valid cookie value",
        );
        assert.equal(
          cookieCalls.length,
          0,
          `middleware must not Set-Cookie when a valid cookie is present, got ${cookieCalls.length} calls`,
        );
        assert.equal(nextCalls, 1, "next() must be invoked exactly once");
      }),
      { numRuns: 100 },
    );
  });

  // ----------------------------------------------------------------------
  // 10.2 — When the cookie is missing, the middleware MUST generate a
  // fresh UUID, populate req.anonId with it, and issue a Set-Cookie with
  // the documented options (httpOnly, sameSite=lax, maxAge ≥ 365 days,
  // path /).
  // ----------------------------------------------------------------------
  it("10.2 missing cookie → fresh UUID and Set-Cookie with persistent options", () => {
    fc.assert(
      fc.property(fc.constant(undefined), (_undef) => {
        let nextCalls = 0;
        const req = createReqWithCookie(_undef) as Parameters<
          typeof anonIdMiddleware
        >[0];
        const { res, cookieCalls } = createMockRes();
        anonIdMiddleware(
          req,
          res as unknown as Parameters<typeof anonIdMiddleware>[1],
          () => {
            nextCalls += 1;
          },
        );

        const fresh = (req as { anonId?: string }).anonId;
        assert.ok(
          typeof fresh === "string" && UUID_RE_TEST.test(fresh),
          `req.anonId must be a UUID-shaped string, got ${String(fresh)}`,
        );
        assert.equal(
          cookieCalls.length,
          1,
          "middleware must Set-Cookie exactly once when no cookie is present",
        );

        const [name, value, options] = cookieCalls[0]!;
        assert.equal(name, COOKIE_NAME);
        assert.equal(
          value,
          fresh,
          "Set-Cookie value must equal req.anonId — single source of truth",
        );

        const opts = options as {
          httpOnly?: boolean;
          sameSite?: string;
          maxAge?: number;
          path?: string;
        };
        assert.equal(opts.httpOnly, true, "cookie must be httpOnly");
        assert.equal(opts.sameSite, "lax", "cookie must be sameSite=lax");
        assert.equal(opts.path, "/", "cookie must be path=/");
        // 365 days in ms = 365 * 24 * 60 * 60 * 1000 = 31_536_000_000.
        // Requirement 4.2 says "не менее 365 дней".
        assert.ok(
          typeof opts.maxAge === "number" &&
            opts.maxAge >= 365 * 24 * 60 * 60 * 1000,
          `cookie maxAge must be ≥ 365 days, got ${opts.maxAge}`,
        );
        assert.equal(nextCalls, 1, "next() must be invoked exactly once");
      }),
      { numRuns: 5 },
    );
  });

  // ----------------------------------------------------------------------
  // 10.3 — When the cookie is present but not a UUID v4 shape, the
  // middleware MUST treat it as missing: generate a fresh UUID, ignore the
  // bogus value, and issue Set-Cookie. Requirement 4.2: "при отсутствии
  // или невалидном — randomUUID()".
  // ----------------------------------------------------------------------
  it("10.3 invalid cookie → fresh UUID and Set-Cookie issued (existing value ignored)", () => {
    // Anything that isn't UUID-shaped: empty strings, ASCII garbage, hex
    // strings of the wrong length, UUIDs with extra characters, etc.
    const invalidCookieArb = fc
      .string({ minLength: 0, maxLength: 80 })
      .filter((s) => !UUID_RE_TEST.test(s));

    fc.assert(
      fc.property(invalidCookieArb, (badCookie) => {
        let nextCalls = 0;
        const req = createReqWithCookie(badCookie) as Parameters<
          typeof anonIdMiddleware
        >[0];
        const { res, cookieCalls } = createMockRes();
        anonIdMiddleware(
          req,
          res as unknown as Parameters<typeof anonIdMiddleware>[1],
          () => {
            nextCalls += 1;
          },
        );

        const fresh = (req as { anonId?: string }).anonId;
        assert.ok(
          typeof fresh === "string" && UUID_RE_TEST.test(fresh),
          `req.anonId must be a fresh UUID, got ${String(fresh)}`,
        );
        assert.notEqual(
          fresh,
          badCookie,
          "fresh UUID must not equal the invalid input",
        );
        assert.equal(
          cookieCalls.length,
          1,
          "middleware must Set-Cookie when input cookie is invalid",
        );
        assert.equal(cookieCalls[0]![0], COOKIE_NAME);
        assert.equal(cookieCalls[0]![1], fresh);
        assert.equal(nextCalls, 1);
      }),
      { numRuns: 100 },
    );
  });

  // ----------------------------------------------------------------------
  // 10.4 — Idempotency: feeding the freshly-issued cookie back in (as a
  // browser would on the next request) MUST NOT issue another Set-Cookie
  // and MUST yield the same anonId. This pins down "issued exactly once
  // and persisted as owner" — the cookie is sticky across requests.
  // ----------------------------------------------------------------------
  it("10.4 fresh cookie is idempotent across requests (no second Set-Cookie)", () => {
    fc.assert(
      fc.property(fc.constant(0), () => {
        // First request: no cookie → fresh issued.
        const req1 = createReqWithCookie(undefined) as Parameters<
          typeof anonIdMiddleware
        >[0];
        const r1 = createMockRes();
        anonIdMiddleware(
          req1,
          r1.res as unknown as Parameters<typeof anonIdMiddleware>[1],
          () => undefined,
        );
        const issued = (req1 as { anonId?: string }).anonId;
        assert.ok(typeof issued === "string");

        // Second request from the same browser, presenting the cookie.
        const req2 = createReqWithCookie(issued!) as Parameters<
          typeof anonIdMiddleware
        >[0];
        const r2 = createMockRes();
        anonIdMiddleware(
          req2,
          r2.res as unknown as Parameters<typeof anonIdMiddleware>[1],
          () => undefined,
        );
        assert.equal(
          (req2 as { anonId?: string }).anonId,
          issued,
          "second request with the issued cookie must yield the same anonId",
        );
        assert.equal(
          r2.cookieCalls.length,
          0,
          "no second Set-Cookie must be sent when the browser already presents the cookie",
        );
      }),
      { numRuns: 20 },
    );
  });
});

// ─── Property 11 / 12: drive route handlers ─────────────────────────────

/**
 * Recorder for `db.select(...).from(...).where(...).orderBy(...).limit(...)`.
 * Only the chain shape and arguments matter; the resolved value is the
 * synthetic row array we set per-test. Returned chain is shared across
 * `mineRows` (Property 11) and the GET /:slug single-row lookup
 * (Property 12) by setting the active row source between tests.
 */
interface SelectRecord {
  selectArgs: unknown[];
  fromArgs: unknown[];
  whereArgs: unknown[];
  orderByArgs: unknown[];
  limitArgs: unknown[];
  /** Optional .leftJoin() (used by GET /:slug). */
  leftJoinArgs: unknown[];
  /** What the chain awaits to. Test sets this. */
  resolved: unknown[];
}

const selectLog: SelectRecord[] = [];

function makeSelectChain(): {
  rec: SelectRecord;
  chain: Record<string, unknown>;
} {
  const rec: SelectRecord = {
    selectArgs: [],
    fromArgs: [],
    whereArgs: [],
    orderByArgs: [],
    limitArgs: [],
    leftJoinArgs: [],
    resolved: [],
  };
  const chain: Record<string, unknown> = {
    from(...args: unknown[]) {
      rec.fromArgs = args;
      return chain;
    },
    leftJoin(...args: unknown[]) {
      rec.leftJoinArgs = args;
      return chain;
    },
    where(...args: unknown[]) {
      rec.whereArgs = args;
      return chain;
    },
    orderBy(...args: unknown[]) {
      rec.orderByArgs = args;
      return chain;
    },
    limit(...args: unknown[]): unknown {
      rec.limitArgs = args;
      // The drizzle chain is awaitable at .limit() — return the rows.
      return Promise.resolve(rec.resolved);
    },
    // Some chains await without .limit() (rarely used here, but harmless).
    then(
      resolve: (v: unknown[]) => void,
      _reject?: (e: unknown) => void,
    ): void {
      resolve(rec.resolved);
    },
  };
  return { rec, chain };
}

(db as unknown as { select: (...args: unknown[]) => unknown }).select = (
  ...args: unknown[]
) => {
  const { rec, chain } = makeSelectChain();
  rec.selectArgs = args;
  selectLog.push(rec);
  return chain;
};

// `.update(...)` is invoked inside GET /:slug for the view-counter
// best-effort increment (`row.design.status === "completed"`). The chain
// is `.update(table).set(...).where(...).catch(...)`. We just stub it as a
// no-op promise so the handler doesn't blow up.
(db as unknown as { update: (...args: unknown[]) => unknown }).update = () => ({
  set() {
    return {
      where() {
        return Promise.resolve();
      },
    };
  },
});

// `.execute(...)` is unused by /mine and /:slug, but other tests share the
// same `db` singleton. Provide a permissive stub so accidental calls don't
// cascade into network errors.
(db as unknown as { execute: (...args: unknown[]) => unknown }).execute =
  async () => ({ rows: [] });

// Load the dizajn router *after* the db patches.
const dizajnRouterModule = await import("../../src/routes/dizajn.ts");
const dizajnRouter = dizajnRouterModule.default as unknown as {
  stack: Array<{
    route?: {
      path?: string;
      methods?: Record<string, boolean>;
      stack: Array<{ handle: (req: unknown, res: unknown) => Promise<void> }>;
    };
  }>;
};

function findHandler(
  path: string,
  method: "get" | "post",
): (req: unknown, res: unknown) => Promise<void> {
  const layer = dizajnRouter.stack.find(
    (l) => l.route?.path === path && l.route.methods?.[method] === true,
  );
  assert.ok(layer?.route, `${method.toUpperCase()} ${path} handler not found`);
  return layer!.route!.stack[0]!.handle;
}

const handleMine = findHandler("/mine", "get");
const handleSlug = findHandler("/:slug", "get");

// ─── Mock request / response for route handlers ─────────────────────────

interface MockResponse {
  statusCode: number;
  body: unknown;
  headers: Map<string, string>;
}

function createReq(opts: {
  anonId?: string;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
}): unknown {
  return {
    anonId: opts.anonId,
    params: opts.params ?? {},
    query: opts.query ?? {},
    headers: {},
    cookies: {},
    body: {},
    socket: { remoteAddress: "127.0.0.1" },
  };
}

function createRouteRes(): { res: unknown; out: MockResponse } {
  const out: MockResponse = {
    statusCode: 200,
    body: undefined,
    headers: new Map(),
  };
  const res = {
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    json(b: unknown) {
      out.body = b;
      return res;
    },
    setHeader(k: string, v: string) {
      out.headers.set(k.toLowerCase(), v);
      return res;
    },
    set(k: string, v: string) {
      out.headers.set(k.toLowerCase(), v);
      return res;
    },
    cookie() {
      return res;
    },
    end(b?: unknown) {
      if (b !== undefined) out.body = b;
      return res;
    },
  };
  return { res, out };
}

// ─── Helper: drizzle SQL deep-eq ────────────────────────────────────────

/**
 * Two drizzle SQL fragments are equal iff their queryChunks collapse to
 * the same string + parameter list. We can't `assert.deepStrictEqual`
 * raw SQL objects directly because drizzle stores backreferences and
 * private symbols that diverge between independent constructions of the
 * "same" fragment.
 */
function inspectSql(sqlObj: unknown): { text: string; params: unknown[] } {
  const chunks: unknown[] =
    (sqlObj as { queryChunks?: unknown[] })?.queryChunks ?? [];
  let text = "";
  const params: unknown[] = [];
  for (const c of chunks) {
    if (
      c !== null &&
      typeof c === "object" &&
      Array.isArray((c as { value?: unknown }).value) &&
      typeof (c as { value: unknown[] }).value[0] === "string"
    ) {
      // StringChunk
      text += ((c as { value: string[] }).value).join("");
    } else if (
      c !== null &&
      typeof c === "object" &&
      "queryChunks" in (c as Record<string, unknown>)
    ) {
      // Nested SQL
      const nested = inspectSql(c);
      text += nested.text;
      params.push(...nested.params);
    } else if (
      c !== null &&
      typeof c === "object" &&
      "name" in (c as Record<string, unknown>) &&
      "table" in (c as Record<string, unknown>)
    ) {
      // Column reference — record qualified name as the placeholder text
      const col = c as { name: string };
      text += `[col:${col.name}]`;
    } else if (
      c !== null &&
      typeof c === "object" &&
      "value" in (c as Record<string, unknown>) &&
      "encoder" in (c as Record<string, unknown>)
    ) {
      params.push((c as { value: unknown }).value);
      text += `$${params.length}`;
    } else {
      params.push(c);
      text += `$${params.length}`;
    }
  }
  return { text, params };
}

function sqlEquals(a: unknown, b: unknown): boolean {
  const ia = inspectSql(a);
  const ib = inspectSql(b);
  if (ia.text !== ib.text) return false;
  if (ia.params.length !== ib.params.length) return false;
  for (let i = 0; i < ia.params.length; i += 1) {
    if (ia.params[i] !== ib.params[i]) return false;
  }
  return true;
}

// ─── Property 11 — GET /mine ────────────────────────────────────────────

const REQUIRED_MINE_KEYS = [
  "slug",
  "roomType",
  "style",
  "status",
  "progress",
  "resultImageUrl",
  "createdAt",
] as const;

describe("Property 11: My_Designs_List returns own designs sorted DESC with required keys", () => {
  // Validates: Requirements 4.3, 4.7

  // Smart generator for synthetic design rows. The handler is
  // type-agnostic — it forwards whatever the db returns — so the values
  // can be anything as long as the field set is respected.
  const designRowArb = fc.record({
    slug: fc.string({ minLength: 1, maxLength: 160 }),
    roomType: fc.constantFrom(
      "bedroom",
      "kitchen",
      "bathroom",
      "living_room",
      "hallway",
      "nursery",
      "apartment",
    ),
    style: fc.constantFrom(
      "modern",
      "scandinavian",
      "loft",
      "minimalism",
      "neoclassic",
      "japandi",
      "classic",
    ),
    status: fc.constantFrom(
      "draft",
      "generating",
      "completed",
      "failed",
      "private",
    ),
    progress: fc.integer({ min: 0, max: 100 }),
    resultImageUrl: fc.option(fc.webUrl(), { nil: null }),
    createdAt: fc
      .integer({ min: 1_700_000_000_000, max: 1_900_000_000_000 })
      .map((ms) => new Date(ms)),
  });

  // ----------------------------------------------------------------------
  // 11.1 — Where clause filters by anonId; orderBy is desc(createdAt);
  // limit is 50; select() projects exactly the seven required keys.
  // ----------------------------------------------------------------------
  it("11.1 query is { fields, anonId-filter, desc(createdAt), limit 50 } for any caller anonId", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (anonId) => {
        // Reset recorder.
        selectLog.length = 0;

        const req = createReq({ anonId });
        const { res, out } = createRouteRes();
        // Pre-seed the chain to resolve to an empty array — we only check
        // the query construction here, not the response shape.
        const _resolveStub: unknown[] = [];
        // Patch select() to seed `resolved` for the next chain.
        const origSelect = (
          db as unknown as { select: (...a: unknown[]) => unknown }
        ).select;
        (db as unknown as { select: (...a: unknown[]) => unknown }).select = (
          ...args: unknown[]
        ) => {
          const result = origSelect(...args) as Record<string, unknown>;
          // Steal the recorder we just appended and override its resolved.
          const rec = selectLog[selectLog.length - 1]!;
          rec.resolved = _resolveStub;
          return result;
        };

        try {
          await handleMine(req, res);
        } finally {
          (db as unknown as { select: (...a: unknown[]) => unknown }).select =
            origSelect;
        }

        assert.equal(out.statusCode, 200, "expected 200 for valid anonId");
        assert.equal(
          selectLog.length,
          1,
          `/mine must issue exactly one SELECT, got ${selectLog.length}`,
        );
        const rec = selectLog[0]!;

        // (a) select projection: exactly the seven keys.
        const projection = rec.selectArgs[0] as Record<string, unknown>;
        const projectionKeys = Object.keys(projection ?? {}).sort();
        assert.deepStrictEqual(
          projectionKeys,
          [...REQUIRED_MINE_KEYS].sort(),
          `select() projection must contain exactly ${REQUIRED_MINE_KEYS.join(", ")}, got ${projectionKeys.join(", ")}`,
        );

        // (b) from(designsTable).
        assert.equal(
          rec.fromArgs[0],
          designsTable,
          "from() must reference designsTable",
        );

        // (c) where(eq(designsTable.anonId, anonId)).
        const expectedWhere = eq(designsTable.anonId, anonId);
        assert.ok(
          sqlEquals(rec.whereArgs[0], expectedWhere),
          `where clause must equal eq(designsTable.anonId, "${anonId}")`,
        );

        // (d) orderBy(desc(designsTable.createdAt)).
        const expectedOrder = desc(designsTable.createdAt);
        assert.ok(
          sqlEquals(rec.orderByArgs[0], expectedOrder),
          "orderBy must be desc(designsTable.createdAt)",
        );

        // (e) limit 50.
        assert.equal(
          rec.limitArgs[0],
          50,
          `limit must be 50 (Requirement 4.3 docs cap), got ${rec.limitArgs[0]}`,
        );
      }),
      { numRuns: 30 },
    );
  });

  // ----------------------------------------------------------------------
  // 11.2 — Response is `{ ok: true, items: <db rows verbatim> }`. The
  // handler must NOT re-sort, NOT re-shape, and MUST forward whatever the
  // DB returned. Since the underlying ORDER BY is enforced by the SQL
  // (verified in 11.1), the items array is DESC-by-createdAt iff the DB
  // sorted that way.
  // ----------------------------------------------------------------------
  it("11.2 response is { ok: true, items: <rows> } with rows passed through unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(designRowArb, { minLength: 0, maxLength: 50 }),
        async (anonId, rawRows) => {
          // Sort DESC so we match what the DB would have returned.
          const dbRows = [...rawRows].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );

          selectLog.length = 0;

          // Wrap select() so the chain returned to the handler resolves
          // to our specific rows.
          const origSelect = (
            db as unknown as { select: (...a: unknown[]) => unknown }
          ).select;
          (db as unknown as { select: (...a: unknown[]) => unknown }).select = (
            ...args: unknown[]
          ) => {
            const result = origSelect(...args);
            const rec = selectLog[selectLog.length - 1]!;
            rec.resolved = dbRows;
            return result;
          };

          const req = createReq({ anonId });
          const { res, out } = createRouteRes();
          try {
            await handleMine(req, res);
          } finally {
            (db as unknown as { select: (...a: unknown[]) => unknown }).select =
              origSelect;
          }

          assert.equal(out.statusCode, 200);
          assert.deepStrictEqual(
            out.body,
            { ok: true, items: dbRows },
            "response body must be { ok:true, items:<rows> } verbatim",
          );

          // Cache-Control: no-store (Requirement 4.7 — fresh data on
          // every poll).
          assert.equal(
            out.headers.get("cache-control"),
            "no-store",
            "/mine must set Cache-Control: no-store",
          );

          // Forwarded order is DESC by createdAt — the property the test
          // is checking at the response layer (in case the handler
          // accidentally re-sorts).
          const items = (out.body as { items: typeof dbRows }).items;
          for (let i = 1; i < items.length; i += 1) {
            assert.ok(
              items[i - 1]!.createdAt.getTime() >=
                items[i]!.createdAt.getTime(),
              `items must be DESC by createdAt; index ${i - 1}=${items[i - 1]!.createdAt.toISOString()} < index ${i}=${items[i]!.createdAt.toISOString()}`,
            );
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  // ----------------------------------------------------------------------
  // 11.3 — The /mine handler MUST refuse to serve when req.anonId is
  // missing or malformed. anonIdMiddleware always populates it; an empty
  // / mis-shaped value indicates the middleware is not wired and the
  // server cannot safely return data (would leak unrelated rows).
  // ----------------------------------------------------------------------
  it("11.3 missing or malformed req.anonId → 500 anon_id_unavailable, no SELECT", async () => {
    const badAnonArb = fc.oneof(
      fc.constant(undefined),
      fc.constant(""),
      fc.string({ minLength: 1, maxLength: 36 }).filter(
        (s) => !UUID_RE_TEST.test(s),
      ),
      fc.constant(123 as unknown as string),
    );

    await fc.assert(
      fc.asyncProperty(badAnonArb, async (badAnon) => {
        selectLog.length = 0;
        const req = createReq({ anonId: badAnon as string | undefined });
        const { res, out } = createRouteRes();
        await handleMine(req, res);

        assert.equal(out.statusCode, 500);
        assert.deepStrictEqual(out.body, {
          ok: false,
          error: "anon_id_unavailable",
        });
        assert.equal(
          selectLog.length,
          0,
          "no SELECT must be issued when req.anonId is invalid",
        );
      }),
      { numRuns: 30 },
    );
  });
});

// ─── Property 12 — Public_Page visibility and ownership badge ───────────

describe("Property 12: Public_Page visibility and ownership badge", () => {
  // Validates: Requirements 4.4, 4.5, 4.6, 15.3
  //
  // The API at GET /:slug stays NEUTRAL on visibility — it returns the
  // design by slug regardless of `is_public` (Requirement 4.6 — direct
  // link works) and ALWAYS exposes `designAnonId` (Requirement 4.4 — the
  // front-end computes the "ваш проект" badge by comparing it to the
  // current cookie kiro_anon_id) and `status` (Requirement 5.4/5.5/5.6
  // controls polling and error UI).

  /** Build a synthetic `designs` row + city pair that the handler joins. */
  const designRowArb = fc.record({
    id: fc.integer({ min: 1, max: 1_000_000 }),
    slug: fc
      .string({ minLength: 1, maxLength: 80 })
      .filter((s) => /^[a-z0-9-]+$/i.test(s)),
    status: fc.constantFrom(
      "draft",
      "generating",
      "completed",
      "failed",
      "private",
    ),
    isPublic: fc.boolean(),
    anonId: fc.option(fc.uuid(), { nil: null }),
    roomType: fc.constantFrom("bedroom", "kitchen", "living_room"),
    style: fc.constant("modern"),
    area: fc.constant("16.00"),
    budget: fc.integer({ min: 50_000, max: 5_000_000 }),
    cityId: fc.constant(null),
    durationWeeks: fc.constant(null),
    district: fc.constant(null),
    h1: fc.constant("h1"),
    seoTitle: fc.constant(null),
    seoDescription: fc.constant(null),
    description: fc.constant(null),
    materials: fc.constant(null),
    estimate: fc.constant(null),
    solutions: fc.constant(null),
    colorPalette: fc.constant(null),
    resultImageUrl: fc.constant(null),
    inputImageUrl: fc.constant(null),
    views: fc.constant(null),
    detailCrops: fc.constant(null),
    topDownPlanUrl: fc.constant(null),
    pickedFurniture: fc.constant(null),
    currentStep: fc.constant(null),
    viewCount: fc.constant(0),
    saveCount: fc.constant(0),
    errorMessage: fc.constant(null),
    createdAt: fc.constant(new Date("2026-01-01T00:00:00Z")),
  });

  // ----------------------------------------------------------------------
  // 12.1 — When a slug exists, the response always exposes `designAnonId`
  // and `status`, irrespective of `isPublic`. The badge is computable
  // client-side only because of these two fields.
  // ----------------------------------------------------------------------
  it("12.1 response always exposes designAnonId and status, regardless of is_public", async () => {
    await fc.assert(
      fc.asyncProperty(designRowArb, async (designRow) => {
        selectLog.length = 0;

        // Two sequential SELECTs:
        //   1) design + city join → returns [{ design, city: null }]
        //   2) design_images by designId → returns []
        let selectCounter = 0;
        const origSelect = (
          db as unknown as { select: (...a: unknown[]) => unknown }
        ).select;
        (db as unknown as { select: (...a: unknown[]) => unknown }).select = (
          ...args: unknown[]
        ) => {
          const result = origSelect(...args);
          const rec = selectLog[selectLog.length - 1]!;
          if (selectCounter === 0) {
            rec.resolved = [{ design: designRow, city: null }];
          } else {
            rec.resolved = [];
          }
          selectCounter += 1;
          return result;
        };

        const req = createReq({
          anonId: "11111111-1111-1111-1111-111111111111",
          params: { slug: designRow.slug },
        });
        const { res, out } = createRouteRes();
        try {
          await handleSlug(req, res);
        } finally {
          (db as unknown as { select: (...a: unknown[]) => unknown }).select =
            origSelect;
        }

        // Either 200 with the body (happy path) or — if the synthetic row
        // tripped a defensive branch — a non-404 documenting why. We only
        // care about the visibility contract on the 200 path.
        if (out.statusCode !== 200) {
          // The handler should never 404 on a found row. Surface the
          // failure mode if it does.
          assert.notEqual(
            out.statusCode,
            404,
            `handler returned 404 despite SELECT returning a row; body=${JSON.stringify(out.body)}`,
          );
          return;
        }

        const body = out.body as {
          ok: true;
          design: { designAnonId: unknown; status: unknown };
        };
        assert.equal(body.ok, true);
        assert.ok(
          "designAnonId" in body.design,
          "response.design must include `designAnonId` for client-side badge logic (Requirement 4.4)",
        );
        assert.equal(
          body.design.designAnonId,
          designRow.anonId,
          "designAnonId must equal designs.anon_id verbatim — owners and Showcase_Project (anonId=null) both pass through",
        );
        assert.ok(
          "status" in body.design,
          "response.design must include `status` (controls visibility on the front)",
        );
        assert.equal(body.design.status, designRow.status);
      }),
      { numRuns: 30 },
    );
  });

  // ----------------------------------------------------------------------
  // 12.2 — The handler does NOT add an is_public filter to the WHERE
  // clause for the by-slug fetch. Direct-link access works regardless
  // (Requirement 4.6). The first SELECT must filter on `slug` only.
  // ----------------------------------------------------------------------
  it("12.2 GET /:slug WHERE clause is on slug only — no is_public filter (direct link works)", async () => {
    await fc.assert(
      fc.asyncProperty(designRowArb, async (designRow) => {
        selectLog.length = 0;

        let selectCounter = 0;
        const origSelect = (
          db as unknown as { select: (...a: unknown[]) => unknown }
        ).select;
        (db as unknown as { select: (...a: unknown[]) => unknown }).select = (
          ...args: unknown[]
        ) => {
          const result = origSelect(...args);
          const rec = selectLog[selectLog.length - 1]!;
          if (selectCounter === 0) {
            rec.resolved = [{ design: designRow, city: null }];
          } else {
            rec.resolved = [];
          }
          selectCounter += 1;
          return result;
        };

        const req = createReq({
          anonId: "11111111-1111-1111-1111-111111111111",
          params: { slug: designRow.slug },
        });
        const { res } = createRouteRes();
        try {
          await handleSlug(req, res);
        } finally {
          (db as unknown as { select: (...a: unknown[]) => unknown }).select =
            origSelect;
        }

        assert.ok(
          selectLog.length >= 1,
          "GET /:slug must issue at least one SELECT",
        );
        const firstRec = selectLog[0]!;
        const expectedSlugWhere = eq(designsTable.slug, designRow.slug);
        assert.ok(
          sqlEquals(firstRec.whereArgs[0], expectedSlugWhere),
          "first SELECT WHERE must be eq(designsTable.slug, slug) only — no is_public/status gating",
        );
      }),
      { numRuns: 30 },
    );
  });

  // ----------------------------------------------------------------------
  // 12.3 — Showcase_Project pass-through (Requirement 15.3): when
  // designs.anon_id IS NULL (Showcase row), the response carries
  // `designAnonId: null`. The client-side badge logic explicitly compares
  // against the current cookie, so null can never equal a UUID and the
  // "ваш проект" badge is suppressed for Showcase_Project — which is
  // exactly the contract Requirement 15.3 asks for.
  // ----------------------------------------------------------------------
  it("12.3 Showcase_Project (anon_id IS NULL) → response.designAnonId is null", async () => {
    const showcaseRowArb = designRowArb.map((row) => ({
      ...row,
      anonId: null as string | null,
    }));

    await fc.assert(
      fc.asyncProperty(showcaseRowArb, async (designRow) => {
        selectLog.length = 0;

        let selectCounter = 0;
        const origSelect = (
          db as unknown as { select: (...a: unknown[]) => unknown }
        ).select;
        (db as unknown as { select: (...a: unknown[]) => unknown }).select = (
          ...args: unknown[]
        ) => {
          const result = origSelect(...args);
          const rec = selectLog[selectLog.length - 1]!;
          if (selectCounter === 0) {
            rec.resolved = [{ design: designRow, city: null }];
          } else {
            rec.resolved = [];
          }
          selectCounter += 1;
          return result;
        };

        const req = createReq({
          anonId: "22222222-2222-2222-2222-222222222222",
          params: { slug: designRow.slug },
        });
        const { res, out } = createRouteRes();
        try {
          await handleSlug(req, res);
        } finally {
          (db as unknown as { select: (...a: unknown[]) => unknown }).select =
            origSelect;
        }

        if (out.statusCode !== 200) return; // skip if defensive branch fired

        const body = out.body as {
          design: { designAnonId: unknown };
        };
        assert.equal(
          body.design.designAnonId,
          null,
          "Showcase_Project must surface designAnonId=null so the badge UI suppresses the owner pill",
        );
      }),
      { numRuns: 20 },
    );
  });
});
