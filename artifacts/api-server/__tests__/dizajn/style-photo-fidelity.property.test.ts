/**
 * Property 9: Bug Condition — Соответствие стилю и фото пользователя.
 *
 * **Validates: Requirements 1.9, 2.9**
 *
 * Источник bug condition: `isBugConditionB(genState).ignores_input`
 *   ignores_input := (genState.userPhotoUrl != null AND NOT genState.usedUserPhoto)
 *   (design.md §Bug Condition B9, §Hypothesized Root Cause 7, §Examples Группа B)
 *
 * Expected Behavior (Property 9, design.md §Correctness Properties):
 *   _For any_ проекта, где задан стиль и присутствует фото пользователя
 *   (`input_image_url` от user-upload), генерация ракурсов SHALL подавать это
 *   фото как reference (edit-image) и усиливать привязку к выбранному стилю,
 *   чтобы рендеры заметно соответствовали стилю и исходному фото.
 *
 * ─── Methodology (bugfix exploration test) ─────────────────────────────────
 * Этот тест — Bug Condition exploration. Он кодирует ОЖИДАЕМЫЙ инвариант
 * Property 9 и ДОЛЖЕН ПАДАТЬ на неисправленном коде, тем самым подтверждая
 * дефект 1.9. Чинить тест/код на этом шаге нельзя.
 *
 * Неисправленный `designWorker.ts` (шаг 2, Hero_Render) генерирует hero-коллаж
 * 2×2 через `falGenerateGptImage` — ЧИСТЫЙ text2img:
 *
 *     const heroPrompt = buildHeroCollagePrompt(
 *       design.roomType, design.style, areaNum, layout);
 *     ...
 *     falGenerateGptImage({
 *       prompt: heroPrompt,
 *       imageSize: "1024x1024",
 *       quality: "high",
 *     })
 *
 * Вызов НЕ принимает `image_urls` и НЕ подаёт `design.input_image_url`
 * пользователя как reference. Даже когда проект — user-upload (клиент загрузил
 * фото своей комнаты), рендеры строятся «с нуля» из текстового промпта и
 * исходное фото игнорируется. Это и есть дефект B9:
 * `userPhotoUrl != null AND NOT usedUserPhoto` → ignores_input.
 *
 * Фикс (задача 11.7, design.md §G) при наличии пользовательского фото
 * (`design.input_image_url`, user-upload, НЕ seed) будет подавать его как
 * reference в hero/ракурсы через edit-image (`getEditImageProvider()` →
 * `falGenerateGptImageEdit` / `falGenerateFluxKontextPro`) с
 * `image_urls=[userPhotoUrl]`, `input_fidelity:"high"`, плюс усилит привязку
 * стиля. Для seed-проектов (нет user-upload) поведение text2img не меняется.
 *
 * До фикса будущего экспортного контракта стратегии генерации ещё нет, поэтому
 * тест аккуратно деградирует к ТОЧНОЙ реплике текущей неисправленной логики
 * (всегда text2img `falGenerateGptImage`, без reference на фото). После фикса
 * тот же тест импортирует реальный `chooseHeroGenerationStrategy` и должен
 * ПРОЙТИ (задача 12.1 — перепрогон без новых тестов).
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// ─── Required input fidelity for user-photo reference (design.md §G) ─────────
//
// Фикс §G требует подавать фото пользователя как reference с максимально
// строгим следованием исходнику — `input_fidelity:"high"` (см. сигнатуру
// `falGenerateGptImageEdit` в falAi.ts: input_fidelity "low" | "high").
const REQUIRED_INPUT_FIDELITY = "high";

// ─── Future hero-generation-strategy contract (added by fix task 11.7) ───────
//
// Фикс §G вводит выбор стратегии генерации hero/ракурсов по тому, есть ли у
// проекта пользовательское фото. Контракт (чистый, без сетевых вызовов)
// описывает выбранный путь генерации:
//
//   mode           — "edit_image" (identity/photo-preserving путь через
//                    getEditImageProvider) либо "text2img" (генерация с нуля
//                    из текстового промпта, `falGenerateGptImage`);
//   imageUrls      — список reference-изображений, подаваемых провайдеру
//                    (для user-upload это [userPhotoUrl]);
//   inputFidelity  — насколько строго следовать reference ("high" | "low" |
//                    null когда reference нет);
//   usesUserPhoto  — подаётся ли фото пользователя как reference.
//
// По образцу `getEditImageProvider()` / `getDesignModel()` / `chooseViewStrategy`
// чистый резолвер помещается в `designConfig.ts` и читается на момент вызова.
// До фикса экспорта нет → `mod.chooseHeroGenerationStrategy` undefined →
// реплика неисправленной логики (всегда text2img без reference).
type HeroGenerationStrategy = {
  mode: "edit_image" | "text2img";
  imageUrls: string[];
  inputFidelity: "high" | "low" | null;
  usesUserPhoto: boolean;
};

type ChooseHeroGenerationStrategyFn = (input: {
  userPhotoUrl: string | null;
  isSeed: boolean;
  style: string;
}) => HeroGenerationStrategy;

let chooseHeroGenerationStrategy: ChooseHeroGenerationStrategyFn | undefined;
try {
  const mod = (await import("../../src/lib/designConfig.js")) as {
    chooseHeroGenerationStrategy?: ChooseHeroGenerationStrategyFn;
  };
  chooseHeroGenerationStrategy = mod.chooseHeroGenerationStrategy;
} catch {
  chooseHeroGenerationStrategy = undefined;
}

// ─── Faithful replica of the unfixed text2img hero path ──────────────────────
//
// Зеркалит designWorker.ts шаг 2 (Hero_Render): hero-коллаж генерится ВСЕГДА
// через `falGenerateGptImage` (text2img) из `buildHeroCollagePrompt`, без
// `image_urls` и без подачи `design.input_image_url` как reference. Это
// ЕДИНСТВЕННЫЙ путь генерации hero в неисправленном коде, поэтому реплика
// возвращает text2img-стратегию, ИГНОРИРУЯ наличие пользовательского фото.
function unfixedText2imgStrategy(): HeroGenerationStrategy {
  return {
    mode: "text2img",
    imageUrls: [], // нет reference — генерация с нуля из текстового промпта
    inputFidelity: null, // reference не подаётся
    usesUserPhoto: false, // фото пользователя игнорируется
  };
}

/**
 * Resolve the hero/views generation strategy for a project.
 *   - Fixed code: delegates to the real `chooseHeroGenerationStrategy()`.
 *   - Unfixed fallback: returns the text2img replica (no reference, ignores
 *     the user photo), regardless of whether a user photo is present.
 */
function resolveHeroStrategy(input: {
  userPhotoUrl: string | null;
  isSeed: boolean;
  style: string;
}): HeroGenerationStrategy {
  return chooseHeroGenerationStrategy
    ? chooseHeroGenerationStrategy(input)
    : unfixedText2imgStrategy();
}

// ─── Property 9 invariant (Expected Behavior) ────────────────────────────────
//
// Проект — user-upload, если у него есть фото пользователя и он НЕ seed.
function isUserUpload(input: {
  userPhotoUrl: string | null;
  isSeed: boolean;
}): boolean {
  return input.userPhotoUrl != null && !input.isSeed;
}

// ignores_input := (userPhotoUrl != null AND NOT usedUserPhoto).
function ignoresInput(
  input: { userPhotoUrl: string | null },
  s: HeroGenerationStrategy,
): boolean {
  return input.userPhotoUrl != null && !s.usesUserPhoto;
}

// Стратегия подаёт фото как reference корректно (edit-image, image_urls,
// input_fidelity "high").
function feedsPhotoAsReference(
  userPhotoUrl: string,
  s: HeroGenerationStrategy,
): boolean {
  return (
    s.mode === "edit_image" &&
    s.usesUserPhoto &&
    Array.isArray(s.imageUrls) &&
    s.imageUrls.length === 1 &&
    s.imageUrls[0] === userPhotoUrl &&
    s.inputFidelity === REQUIRED_INPUT_FIDELITY
  );
}

// ─── Generators ──────────────────────────────────────────────────────────────

// Правдоподобные URL пользовательского фото (R2/object-storage).
const USER_PHOTO_URL = fc
  .webUrl()
  .map((u) => `${u}/uploads/user-room-${Math.abs(hashStr(u))}.jpg`);

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// Поддерживаемые стили (ключи STYLE_RU_CLAUSES в designWorker.ts).
const STYLE = fc.constantFrom(
  "modern",
  "scandinavian",
  "loft",
  "classic",
  "minimalism",
  "japandi",
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Property 9 (Bug Condition): соответствие стилю и фото пользователя", () => {
  // ---------------------------------------------------------------------------
  // B9 (основной success-путь): когда проект — user-upload (есть
  // `input_image_url`, НЕ seed), генерация ракурсов SHALL подавать фото как
  // reference через edit-image (`image_urls=[userPhotoUrl]`,
  // `input_fidelity:"high"`), т.е. NOT ignores_input.
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL — hero генерится text2img
  // `falGenerateGptImage` без reference (usesUserPhoto=false).
  // Validates: Requirements 1.9, 2.9
  // ---------------------------------------------------------------------------
  it("при наличии фото пользователя ракурсы генерятся edit-image с image_urls=[userPhotoUrl], input_fidelity:high", () => {
    const userPhotoUrl = "https://cdn.example.com/uploads/user-room-42.jpg";
    const input = { userPhotoUrl, isSeed: false, style: "modern" };
    const s = resolveHeroStrategy(input);

    assert.ok(
      feedsPhotoAsReference(userPhotoUrl, s),
      `генерация ракурсов не подаёт фото пользователя как reference: ` +
        `mode="${s.mode}", usesUserPhoto=${s.usesUserPhoto}, ` +
        `imageUrls=${JSON.stringify(s.imageUrls)}, ` +
        `inputFidelity=${JSON.stringify(s.inputFidelity)}. ` +
        `Ожидается edit-image c image_urls=["${userPhotoUrl}"] и ` +
        `input_fidelity:"${REQUIRED_INPUT_FIDELITY}" (контрпример: hero ` +
        `генерится falGenerateGptImage text2img без reference на фото).`,
    );
  });

  // ---------------------------------------------------------------------------
  // Scoped PBT — для любого user-upload проекта (фото присутствует, НЕ seed) и
  // любого выбранного стиля стратегия SHALL подавать фото как reference
  // (NOT ignores_input). Для seed-проектов (фото нет) поведение не проверяется
  // на reference — text2img допустим (Preservation §G).
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL — реплика всегда text2img,
  // фото игнорируется → ignores_input держится на каждом user-upload.
  // Validates: Requirements 1.9, 2.9
  // ---------------------------------------------------------------------------
  it("любой user-upload проект подаёт фото как reference (NOT ignores_input)", () => {
    fc.assert(
      fc.property(USER_PHOTO_URL, STYLE, (userPhotoUrl, style) => {
        const input = { userPhotoUrl, isSeed: false, style };
        const s = resolveHeroStrategy(input);

        // user-upload → фото обязано подаваться как reference.
        assert.ok(
          feedsPhotoAsReference(userPhotoUrl, s),
          `user-upload (style="${style}", photo="${userPhotoUrl}") не подаёт ` +
            `фото как reference: mode="${s.mode}", ` +
            `usesUserPhoto=${s.usesUserPhoto}, ` +
            `imageUrls=${JSON.stringify(s.imageUrls)}, ` +
            `inputFidelity=${JSON.stringify(s.inputFidelity)}.`,
        );
        // И bug condition B9 не должен держаться.
        assert.equal(
          ignoresInput(input, s),
          false,
          `ignores_input держится: фото "${userPhotoUrl}" задано, но ` +
            `usedUserPhoto=${s.usesUserPhoto}.`,
        );
      }),
      { numRuns: 200 },
    );
  });

  // ---------------------------------------------------------------------------
  // Preservation-направляющая: seed-проект (нет пользовательского фото) — фото
  // подавать нечего, поэтому ignores_input ложно при любой стратегии. Эта
  // проверка фиксирует, что инвариант Property 9 ограничен user-upload и не
  // ломается на seed-проектах (для них text2img остаётся допустимым).
  //
  // EXPECTED OUTCOME на неисправленном коде: PASS (на seed-проектах дефекта
  // нет — нечего игнорировать). Падение основного инварианта выше — на
  // user-upload — и есть подтверждение дефекта.
  // Validates: Requirements 1.9, 2.9
  // ---------------------------------------------------------------------------
  it("seed-проект (без фото) не триггерит ignores_input (граница инварианта)", () => {
    fc.assert(
      fc.property(STYLE, (style) => {
        const input = { userPhotoUrl: null, isSeed: true, style };
        const s = resolveHeroStrategy(input);
        assert.equal(
          ignoresInput(input, s),
          false,
          `seed-проект не имеет фото, ignores_input должен быть false, ` +
            `получено usesUserPhoto=${s.usesUserPhoto}.`,
        );
        assert.equal(
          isUserUpload(input),
          false,
          "seed-проект не должен классифицироваться как user-upload",
        );
      }),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Документированный контрпример (design.md §Examples Группа B):
  // «Пользователь загрузил фото комнаты, но hero генерится falGenerateGptImage
  // (text2img) без референса на фото». Фиксируем, что текущий путь нарушает
  // Property 9 именно так: фото присутствует, но не подаётся как reference.
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL — ignores_input подтверждён.
  // Validates: Requirements 1.9, 2.9
  // ---------------------------------------------------------------------------
  it("контрпример: фото загружено, но hero идёт text2img без reference (ignores_input)", () => {
    const userPhotoUrl = "https://cdn.example.com/uploads/bedroom-before.jpg";
    const input = { userPhotoUrl, isSeed: false, style: "scandinavian" };
    const s = resolveHeroStrategy(input);

    assert.equal(
      ignoresInput(input, s),
      false,
      `ignores_input держится: фото пользователя "${userPhotoUrl}" задано, ` +
        `но стратегия генерации его игнорирует ` +
        `(mode="${s.mode}", usesUserPhoto=${s.usesUserPhoto}, ` +
        `imageUrls=${JSON.stringify(s.imageUrls)}). ` +
        `Ожидается edit-image с фото как reference (Property 9, §G).`,
    );
  });
});
