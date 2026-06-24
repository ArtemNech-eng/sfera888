/**
 * End-to-end test-render для AI_Design_Product (план §22, спека
 * `.kiro/specs/ai-design-product`).
 *
 * Запускает полный 11-шаговый Generation_Pipeline синхронно (без HTTP),
 * прямо в текущем процессе:
 *
 *   1. INSERT в `designs` (или повторное использование `--design-id=N`).
 *   2. Поднимает `startDesignWorker()` — фоновый tick (5s интервал)
 *      перехватывает запись в `status='generating'` и вызывает
 *      приватную `processDesign(designId)` (см. designWorker.ts).
 *   3. Параллельно polling'ом каждые 2 секунды читает
 *      `current_step` / `progress` / `status` и логирует переходы FSM
 *      с тайм-стампами.
 *   4. По завершении (`status` ∈ {`completed`, `failed`}) останавливает
 *      воркер, печатает публичный URL `/dizajn/{slug}`, total cost
 *      (сумма `design_generations.cost_kopeks`) и время.
 *   5. Запись в БД остаётся для ручной проверки страницы в браузере
 *      (поведение `--keep` всегда включено — запись не удаляется ни
 *      при успехе, ни при сбое; cleanup делайте вручную).
 *
 * НЕ часть рантайма / production. Не вызывайте автоматически в CI без
 * подтверждения: один прогон тратит реальные деньги Fal.ai + OpenAI
 * (~30–50 ₽). См. `docs/ai-design/RELEASE_PREP.md` §5 «Smoke test».
 *
 * Использование:
 *   pnpm --filter @workspace/scripts test-render                            # новый дизайн
 *   pnpm --filter @workspace/scripts test-render --dry-run                  # проверить env / план, без вызовов
 *   pnpm --filter @workspace/scripts test-render --design-id=42             # повторно дождаться готового / запустить из failed
 *   pnpm --filter @workspace/scripts test-render --room=kitchen --style=loft
 *   pnpm --filter @workspace/scripts test-render --width=320 --length=400 --height=270 --budget=500000 --city=Краснодар
 *
 * CLI:
 *   --design-id=N        Использовать существующую запись вместо INSERT.
 *                        Если status уже 'completed' — выводим URL и
 *                        выходим без запуска воркера.
 *   --dry-run            Не делает INSERT, не поднимает воркер; печатает
 *                        план и набор env vars. Используйте перед первым
 *                        запуском, чтобы убедиться что всё есть.
 *   --keep               (no-op для совместимости) — запись всегда
 *                        остаётся в БД для ручной проверки страницы.
 *   --timeout=SECONDS    Override таймаута ожидания пайплайна (default
 *                        15 минут). Воркер всё равно подвешивает stuck
 *                        записи через 10 минут (см. designWorker.STUCK_TIMEOUT_MIN).
 *   --room=NAME          bedroom (default), kitchen, bathroom, ...
 *   --style=NAME         modern (default), japandi, scandinavian, ...
 *   --width=CM           default 320
 *   --length=CM          default 400
 *   --height=CM          default 270
 *   --budget=RUB         в рублях, не копейках. default 500_000.
 *   --city=NAME          имя из `cities.name` (default «Краснодар»).
 *                        Если не найден — `city_id` остаётся NULL,
 *                        Materials_Estimator использует общероссийский
 *                        коэффициент (см. designWorker §11).
 *
 * ВАЖНО:
 *   • DATABASE_URL обязателен — без него @workspace/db падает на импорте.
 *     Скрипт НЕ печатает значение в stdout.
 *   • Полный список env'ов ниже + в `docs/ai-design/RELEASE_PREP.md` §1.
 *     Captcha (Turnstile) и Chromium для PDF не нужны — мы вызываем
 *     воркер напрямую, минуя HTTP-route и PDF-render.
 */

// Defer all heavy imports (api-server lib, drizzle, sharp via worker chain)
// until we've validated env. Это позволяет --dry-run / --help работать без
// настройки R2/Fal.

if (!process.env["DATABASE_URL"]) {
  console.error("\n[test-render] ERROR: DATABASE_URL is not set.\n");
  process.exit(1);
}

import { randomUUID } from "node:crypto";

interface CliArgs {
  designId: number | null;
  dryRun: boolean;
  keep: boolean;
  timeoutMs: number;
  room: string;
  style: string;
  widthCm: number;
  lengthCm: number;
  heightCm: number;
  budgetRub: number;
  cityName: string;
}

function parseCli(): CliArgs {
  const argv = process.argv.slice(2);
  const a: CliArgs = {
    designId: null,
    dryRun: false,
    keep: true, // запись всегда сохраняем — `--keep` оставлен no-op'ом
    timeoutMs: 15 * 60 * 1000,
    room: "bedroom",
    style: "modern",
    widthCm: 320,
    lengthCm: 400,
    heightCm: 270,
    budgetRub: 500_000,
    cityName: "Краснодар",
  };
  for (const arg of argv) {
    if (arg === "--dry-run") a.dryRun = true;
    else if (arg === "--keep") a.keep = true;
    else if (arg.startsWith("--design-id=")) {
      const n = Number.parseInt(arg.slice("--design-id=".length), 10);
      if (Number.isFinite(n) && n > 0) a.designId = n;
    } else if (arg.startsWith("--timeout=")) {
      const sec = Number.parseInt(arg.slice("--timeout=".length), 10);
      if (Number.isFinite(sec) && sec > 0) a.timeoutMs = sec * 1000;
    } else if (arg.startsWith("--room=")) a.room = arg.slice("--room=".length);
    else if (arg.startsWith("--style=")) a.style = arg.slice("--style=".length);
    else if (arg.startsWith("--width=")) {
      const n = Number.parseInt(arg.slice("--width=".length), 10);
      if (Number.isFinite(n) && n > 0) a.widthCm = n;
    } else if (arg.startsWith("--length=")) {
      const n = Number.parseInt(arg.slice("--length=".length), 10);
      if (Number.isFinite(n) && n > 0) a.lengthCm = n;
    } else if (arg.startsWith("--height=")) {
      const n = Number.parseInt(arg.slice("--height=".length), 10);
      if (Number.isFinite(n) && n > 0) a.heightCm = n;
    } else if (arg.startsWith("--budget=")) {
      const n = Number.parseInt(arg.slice("--budget=".length), 10);
      if (Number.isFinite(n) && n > 0) a.budgetRub = n;
    } else if (arg.startsWith("--city=")) a.cityName = arg.slice("--city=".length);
    else if (arg === "--help" || arg === "-h") {
      printUsageAndExit(0);
    } else if (arg !== "--") {
      console.error(`[test-render] unknown arg: ${arg}`);
      printUsageAndExit(2);
    }
  }
  return a;
}

function printUsageAndExit(code: number): never {
  console.log(`
Usage: pnpm --filter @workspace/scripts test-render [options]

Options:
  --design-id=N        re-run / observe an existing design row
  --dry-run            validate env + print plan, no DB writes, no worker
  --timeout=SECONDS    pipeline wait timeout (default 900 = 15 min)
  --room=NAME          bedroom (default) | kitchen | bathroom | ...
  --style=NAME         modern (default) | japandi | scandinavian | ...
  --width=CM           default 320
  --length=CM          default 400
  --height=CM          default 270
  --budget=RUB         default 500000
  --city=NAME          default «Краснодар»
  --keep               (no-op) row is always kept for manual inspection
  -h, --help           print this help and exit
`);
  process.exit(code);
}

// ─── Env validation (separate from heavy imports) ───────────────────────────

interface EnvProbe {
  key: string;
  required: boolean;
  description: string;
}

const REQUIRED_ENV: EnvProbe[] = [
  { key: "DATABASE_URL", required: true, description: "Postgres connection string." },
  { key: "FAL_API_KEY", required: true, description: "Fal.ai key (Hero/Angle/Iso renders)." },
  {
    key: "AI_INTEGRATIONS_OPENAI_API_KEY",
    required: true,
    description: "OpenAI-compatible gateway (Layout_Planner + designContent).",
  },
  {
    key: "DEFAULT_OBJECT_STORAGE_BUCKET_ID",
    required: true,
    description: "R2/GCS bucket id for AI-render uploads.",
  },
  { key: "R2_ENDPOINT", required: true, description: "S3-compatible Cloudflare R2 endpoint." },
  { key: "R2_ACCESS_KEY_ID", required: true, description: "R2 access key id." },
  { key: "R2_SECRET_ACCESS_KEY", required: true, description: "R2 secret access key." },
];

const OPTIONAL_ENV: EnvProbe[] = [
  {
    key: "AI_INTEGRATIONS_OPENAI_BASE_URL",
    required: false,
    description: "AI gateway base URL (e.g. https://openrouter.ai/api/v1).",
  },
  {
    key: "AI_INTEGRATIONS_OPENAI_MODEL",
    required: false,
    description: "Default AI model (fallback for Layout_Planner / designContent).",
  },
  {
    key: "AI_INTEGRATIONS_DESIGN_MODEL",
    required: false,
    description: "Override model for Layout_Planner / designContent.",
  },
  {
    key: "AI_DESIGN_EDIT_PROVIDER",
    required: false,
    description: "Angle_Render provider: gpt_image_1_5_edit (default) | flux_kontext_pro.",
  },
  {
    key: "DESIGN_COST_CEILING_KOPEKS",
    required: false,
    description: "Cost ceiling per design in kopeks (default 3000 = ~30 ₽).",
  },
  {
    key: "MARKETPLACE_PUBLIC_URL",
    required: false,
    description: "Public marketplace URL for the final /dizajn/{slug} link (default https://chestnye-mastera.ru).",
  },
  { key: "R2_REGION", required: false, description: "R2 region (default 'auto')." },
  {
    key: "R2_PUBLIC_URL",
    required: false,
    description: "R2 CDN URL (used by some routes; not strictly needed for worker).",
  },
];

function validateEnv(): { missing: string[] } {
  const missing: string[] = [];
  for (const p of REQUIRED_ENV) {
    if (!process.env[p.key]) missing.push(p.key);
  }
  return { missing };
}

function printEnvSnapshot(): void {
  const lines: string[] = [];
  lines.push("[test-render] env probe:");
  for (const p of REQUIRED_ENV) {
    const present = !!process.env[p.key];
    // NEVER print values — even DATABASE_URL gets only present/missing.
    lines.push(`  ${present ? "✓" : "✗"} ${p.key} (required) — ${p.description}`);
  }
  for (const p of OPTIONAL_ENV) {
    const present = !!process.env[p.key];
    lines.push(`  ${present ? "✓" : "·"} ${p.key} (optional) — ${p.description}`);
  }
  console.log(lines.join("\n"));
}

// ─── Main ───────────────────────────────────────────────────────────────────

const args = parseCli();
printEnvSnapshot();

if (args.dryRun) {
  console.log(`
[test-render] DRY RUN — план запуска:
  • ${args.designId ? `re-use existing design id=${args.designId}` : "INSERT new design"}
  • room=${args.room} style=${args.style} ${args.widthCm}×${args.lengthCm}×${args.heightCm} cm budget=${args.budgetRub}₽ city=«${args.cityName}»
  • timeout=${Math.round(args.timeoutMs / 1000)}s
  • marketplace base: ${process.env.MARKETPLACE_PUBLIC_URL ?? "https://chestnye-mastera.ru"} (default fallback shown if env not set)

Re-run без --dry-run чтобы запустить пайплайн.
`);
  process.exit(0);
}

const envCheck = validateEnv();
if (envCheck.missing.length > 0) {
  console.error(`
[test-render] ERROR: missing required env: ${envCheck.missing.join(", ")}.
Запустите --dry-run чтобы увидеть полный список ожидаемых переменных и их назначение.
`);
  process.exit(1);
}

// Heavy dynamic imports — после валидации env, чтобы не падать на
// `objectStorage.ts` (`s3Client = getS3Client()` на module-load) когда R2
// не настроен.
const { db, pool, designsTable } = await import("@workspace/db");
const { startDesignWorker, stopDesignWorker } = await import(
  "../../artifacts/api-server/src/lib/designWorker.js"
);
const { pickUniqueSlug } = await import(
  "../../artifacts/api-server/src/lib/slug.js"
);

interface DesignRow {
  id: number;
  slug: string | null;
  status: string;
  progress: number;
  currentStep: string | null;
  errorMessage: string | null;
  resultImageUrl: string | null;
}

async function fetchDesign(id: number): Promise<DesignRow | null> {
  const r = await pool.query(
    `SELECT id, slug, status, progress, current_step, error_message, result_image_url
       FROM designs WHERE id = $1`,
    [id],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0]!;
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    progress: row.progress,
    currentStep: row.current_step,
    errorMessage: row.error_message,
    resultImageUrl: row.result_image_url,
  };
}

async function findCityIdByName(name: string): Promise<number | null> {
  const r = await pool.query(`SELECT id FROM cities WHERE name = $1 LIMIT 1`, [name]);
  if (r.rowCount === 0) return null;
  return r.rows[0]!.id as number;
}

async function totalCostKopeks(designId: number): Promise<number> {
  const r = await pool.query(
    `SELECT COALESCE(SUM(cost_kopeks), 0)::bigint AS sum
       FROM design_generations WHERE design_id = $1`,
    [designId],
  );
  return Number(r.rows[0]?.sum ?? 0);
}

function publicUrlFor(slug: string): string {
  const base = process.env.MARKETPLACE_PUBLIC_URL?.replace(/\/+$/, "") ?? "https://chestnye-mastera.ru";
  return `${base}/dizajn/${slug}`;
}

function fmtElapsed(startMs: number): string {
  const sec = Math.round((Date.now() - startMs) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
}

// ─── Pipeline run ───────────────────────────────────────────────────────────

async function ensureDesign(): Promise<{ design: DesignRow; created: boolean }> {
  if (args.designId) {
    const existing = await fetchDesign(args.designId);
    if (!existing) {
      throw new Error(`design id=${args.designId} not found`);
    }
    return { design: existing, created: false };
  }

  // INSERT a fresh design.
  const cityId = await findCityIdByName(args.cityName);
  if (cityId === null) {
    console.warn(
      `[test-render] city name «${args.cityName}» not found in cities — city_id оставлен NULL, `
      + `Materials_Estimator подставит дефолтный коэффициент.`,
    );
  }

  // Площадь м² из width × length (Layout_Planner потом восстановит стороны
  // из area через layoutDim()).
  const areaSqm = (args.widthCm * args.lengthCm) / 10_000;
  const areaStr = areaSqm.toFixed(2);

  const slug = await pickUniqueSlug({
    roomType: args.room,
    style: args.style,
    extraSegments: ["test", randomUUID().slice(0, 6)],
  });

  const anonId = randomUUID();

  const inserted = await db
    .insert(designsTable)
    .values({
      slug,
      anonId,
      roomType: args.room,
      style: args.style,
      cityId,
      area: areaStr,
      budget: args.budgetRub,
      durationWeeks: null,
      status: "generating",
      progress: 0,
    })
    .returning({ id: designsTable.id, slug: designsTable.slug });

  const created = inserted[0];
  if (!created) {
    throw new Error("INSERT designs returned no rows");
  }

  console.log(
    `[test-render] inserted design id=${created.id} slug=${created.slug} `
    + `room=${args.room} style=${args.style} area=${areaStr}m² budget=${args.budgetRub}₽ `
    + `cityId=${cityId ?? "NULL"} (anonId=${anonId.slice(0, 8)}...)`,
  );

  // Re-fetch full row so subsequent polling has consistent shape.
  const fetched = await fetchDesign(created.id);
  if (!fetched) throw new Error("design vanished immediately after insert");
  return { design: fetched, created: true };
}

async function pollUntilDone(designId: number, startMs: number): Promise<DesignRow> {
  let lastStep: string | null = null;
  let lastProgress = -1;
  let lastStatus = "";

  while (true) {
    const elapsed = Date.now() - startMs;
    if (elapsed > args.timeoutMs) {
      throw new Error(
        `pipeline timeout after ${Math.round(args.timeoutMs / 1000)}s — design id=${designId} `
        + `still in status='generating'. Worker подвешивает stuck-записи через 10 минут; `
        + `проверьте "SELECT status, error_message FROM designs WHERE id = ${designId}" вручную.`,
      );
    }

    const row = await fetchDesign(designId);
    if (!row) throw new Error(`design id=${designId} disappeared during poll`);

    if (row.status !== lastStatus
        || row.currentStep !== lastStep
        || row.progress !== lastProgress) {
      console.log(
        `[t=${fmtElapsed(startMs)}] status=${row.status} step=${row.currentStep ?? "-"} `
        + `progress=${row.progress}%`,
      );
      lastStatus = row.status;
      lastStep = row.currentStep;
      lastProgress = row.progress;
    }

    if (row.status === "completed" || row.status === "failed") {
      return row;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function main(): Promise<void> {
  const startMs = Date.now();
  const { design, created } = await ensureDesign();

  // Если запись уже completed (повторный запуск через --design-id) — просто
  // распечатываем результат и выходим без воркера.
  if (design.status === "completed") {
    console.log(`[test-render] design id=${design.id} already completed — skipping pipeline.`);
    const cost = await totalCostKopeks(design.id);
    const url = design.slug ? publicUrlFor(design.slug) : "(slug missing)";
    console.log(`
[test-render] PASSED (already completed)
  design id      : ${design.id}
  slug           : ${design.slug ?? "(null)"}
  public URL     : ${url}
  result image   : ${design.resultImageUrl ?? "(null)"}
  total cost     : ${cost} kopeks (~${(cost / 100).toFixed(2)} ₽)
`);
    return;
  }

  // Если design.status === 'failed' и --design-id заданный — даём шанс
  // повторить пайплайн, переведя его в 'generating'. Это полезно после
  // фикса env / каталогов.
  if (design.status === "failed" && args.designId) {
    console.log(
      `[test-render] design id=${design.id} was 'failed' (${design.errorMessage ?? "no msg"}) — re-arming to 'generating'.`,
    );
    await pool.query(
      `UPDATE designs SET status = 'generating', progress = 0, current_step = NULL,
                          error_message = NULL, updated_at = NOW()
        WHERE id = $1`,
      [design.id],
    );
  } else if (design.status !== "generating") {
    throw new Error(
      `design id=${design.id} has unexpected status='${design.status}' — `
      + `expected 'generating' (newly inserted) or 'completed' (skip) or 'failed' (re-arm via --design-id).`,
    );
  }

  console.log(
    `[test-render] starting designWorker (5s tick) — будет наблюдать `
    + `id=${design.id} до status ∈ {completed, failed} (timeout ${Math.round(args.timeoutMs / 1000)}s).`,
  );
  startDesignWorker();

  let final: DesignRow;
  try {
    final = await pollUntilDone(design.id, startMs);
  } finally {
    stopDesignWorker();
  }

  const elapsed = fmtElapsed(startMs);
  const cost = await totalCostKopeks(final.id);
  const url = final.slug ? publicUrlFor(final.slug) : "(slug missing)";

  if (final.status === "completed") {
    console.log(`
[test-render] PASSED
  design id      : ${final.id}
  slug           : ${final.slug ?? "(null)"}
  public URL     : ${url}
  result image   : ${final.resultImageUrl ?? "(null)"}
  total cost     : ${cost} kopeks (~${(cost / 100).toFixed(2)} ₽)
  elapsed        : ${elapsed}
  was created    : ${created ? "yes (new row)" : "no (re-used)"}
`);
    process.exitCode = 0;
  } else {
    console.error(`
[test-render] FAILED
  design id      : ${final.id}
  slug           : ${final.slug ?? "(null)"}
  status         : ${final.status}
  error_message  : ${final.errorMessage ?? "(null)"}
  partial cost   : ${cost} kopeks (~${(cost / 100).toFixed(2)} ₽)
  elapsed        : ${elapsed}
  Чтобы повторить после фикса env: pnpm --filter @workspace/scripts test-render -- --design-id=${final.id}
`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("[test-render] fatal:", e instanceof Error ? e.stack ?? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  });
