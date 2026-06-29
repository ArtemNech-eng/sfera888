/**
 * Публикация `SEO_Page` для пайплайна AI_Design_3D_Blockout (подход B2).
 *
 * См. `.kiro/specs/ai-design-3d-blockout/design.md` секцию «Components and
 * Interfaces → SEO publish» (шаг пайплайна 8) и `requirements.md`
 * Requirement 11 (публикация SEO-страниц и партия проектов).
 *
 * Что делает этот модуль (задача 12.1):
 *   • `publishSeoPage(input)` — вставляет строку в таблицу `designs`
 *     (`status=completed`, `is_public=true`, заполненные `views[]`,
 *     `resultImageUrl` и структурированный `content`) — НО только в окружении
 *     Railway с доступной БД (Requirement 11.1, 11.3).
 *   • Если БД недоступна / нет `DATABASE_URL` / запуск не на Railway — шаг
 *     публикации пропускается БЕЗ падения, а публичный URL борда сохраняется
 *     в выводе, чтобы публикацию можно было повторить позже
 *     (Requirement 11.4, 11.5).
 *
 * Почему динамический импорт `@workspace/db`:
 *   модуль `@workspace/db` на этапе загрузки бросает ошибку, если не задан
 *   `DATABASE_URL` (см. `lib/db/src/index.ts`). Поэтому БД импортируется
 *   динамически и только после того, как проверены и Railway-окружение, и
 *   наличие `DATABASE_URL` — иначе локальный запуск падал бы на самом импорте,
 *   нарушая «пропуск без падения» (Requirement 11.4). Типы импортируются через
 *   `import type` (стираются при компиляции и не вызывают загрузку модуля во
 *   время выполнения).
 *
 * Контракт `designs` и `objectStorage.ts` НЕ изменяется.
 */

import type {
  DesignView,
  DesignMaterial,
  DesignEstimateItem,
  DesignSolution,
  DesignColorSwatch,
} from "@workspace/db";

/**
 * Переменные окружения Railway, по которым определяется запуск в окружении
 * Railway (любая из них достаточна). Railway выставляет их во время исполнения
 * сервиса; локально они отсутствуют.
 */
export const RAILWAY_ENV_VARS = [
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_ENVIRONMENT_NAME",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
  "RAILWAY_PROJECT_NAME",
  "RAILWAY_SERVICE_NAME",
] as const;

/**
 * Структурированный `content` SEO-страницы. Поля повторяют форму артефактов
 * `designs` (materials/estimate/solutions/colorPalette + SEO-метаданные) и
 * формируются вызывающим кодом так же, как в существующем 2D-пути.
 */
export interface SeoPageContent {
  /** Тип помещения (`designs.room_type`, обязателен). */
  roomType: string;
  /** Стиль (`designs.style`, обязателен). */
  style: string;
  /** Площадь, м² (опц.; пишется в numeric-колонку строкой). */
  area?: number | null;
  /** Бюджет проекта, ₽ (опц.). */
  budget?: number | null;
  /** Сроки реализации, недель (опц.). */
  durationWeeks?: number | null;
  /** Город (FK `cities.id`, опц.). */
  cityId?: number | null;
  /** Район (опц.). */
  district?: string | null;
  /** SEO-slug публичной страницы `/dizajn/{slug}` (опц.). */
  slug?: string | null;
  /** SEO-метаданные (опц.). */
  h1?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  description?: string | null;
  /** Структурированные артефакты дизайн-проекта (опц.). */
  materials?: DesignMaterial[];
  estimate?: DesignEstimateItem[];
  solutions?: DesignSolution[];
  colorPalette?: DesignColorSwatch[];
}

/** Вход `publishSeoPage`. */
export interface PublishSeoPageInput {
  /** Публичный URL борда в R2 (всегда сохраняется в выводе — Req 11.5). */
  boardPublicUrl: string;
  /** Ракурсы проекта для `designs.views[]` (Requirement 11.1). */
  views: DesignView[];
  /** Структурированный контент SEO-страницы. */
  content: SeoPageContent;
}

/**
 * Результат `publishSeoPage`. `boardPublicUrl` присутствует всегда — даже при
 * пропуске публикации, — чтобы прерванную/пропущенную публикацию можно было
 * повторить позже (Requirement 11.5, Property 26).
 */
export interface PublishSeoPageResult {
  /** true — строка в `designs` создана; false — публикация пропущена. */
  published: boolean;
  /** Публичный URL борда (сохраняется всегда — Req 11.5). */
  boardPublicUrl: string;
  /** id созданной записи `designs` (только при `published=true`). */
  designId?: number;
  /** Причина пропуска публикации (только при `published=false`). */
  skippedPublishReason?: string;
}

/**
 * Определяет, выполняется ли код в окружении Railway, по наличию любой из
 * характерных переменных окружения Railway (Requirement 11.3).
 */
export function isRailwayEnvironment(): boolean {
  return RAILWAY_ENV_VARS.some((name) => {
    const value = process.env[name];
    return value !== undefined && value.trim() !== "";
  });
}

/** Проверяет наличие непустого `DATABASE_URL`. */
function hasDatabaseUrl(): boolean {
  const value = process.env.DATABASE_URL;
  return value !== undefined && value.trim() !== "";
}

/** Формирует результат пропуска публикации с сохранением URL борда. */
function skip(
  boardPublicUrl: string,
  reason: string,
): PublishSeoPageResult {
  return { published: false, boardPublicUrl, skippedPublishReason: reason };
}

/**
 * Публикует готовый борд как `SEO_Page` в таблице `designs`.
 *
 * Вставка выполняется ТОЛЬКО в окружении Railway с доступной БД. Во всех
 * остальных случаях (не Railway, нет `DATABASE_URL`, БД недоступна) шаг
 * пропускается без выброса ошибки, а `boardPublicUrl` сохраняется в выводе
 * для повторной публикации (Requirement 11.3, 11.4, 11.5).
 *
 * Метод НЕ бросает исключения по причинам окружения/доступности БД — он
 * возвращает `published=false` со `skippedPublishReason`. Это сознательный
 * контракт: загрузка борда в R2 уже выполнена, и сбой публикации не должен
 * терять результат работы (стратегия аккуратной деградации, Requirement 13).
 */
export async function publishSeoPage(
  input: PublishSeoPageInput,
): Promise<PublishSeoPageResult> {
  const { boardPublicUrl, views, content } = input;

  // 1. Публикация в БД — только на Railway (Requirement 11.3).
  if (!isRailwayEnvironment()) {
    return skip(
      boardPublicUrl,
      "Публикация пропущена: запуск не в окружении Railway",
    );
  }

  // 2. Без DATABASE_URL подключение к БД невозможно (Requirement 11.4).
  //    Проверяется ДО динамического импорта `@workspace/db`, который иначе
  //    бросил бы ошибку прямо на загрузке модуля.
  if (!hasDatabaseUrl()) {
    return skip(
      boardPublicUrl,
      "Публикация пропущена: DATABASE_URL не задан",
    );
  }

  // 3. БД доступна по конфигурации — пробуем вставить строку. Любой сбой
  //    подключения/запроса трактуется как «БД недоступна»: пропуск без
  //    падения с сохранением URL борда (Requirement 11.4, 11.5).
  try {
    const { db, designsTable } = await import("@workspace/db");

    const inserted = await db
      .insert(designsTable)
      .values({
        slug: content.slug ?? undefined,
        roomType: content.roomType,
        style: content.style,
        cityId: content.cityId ?? undefined,
        district: content.district ?? undefined,
        area:
          content.area === undefined || content.area === null
            ? undefined
            : content.area.toString(),
        budget: content.budget ?? undefined,
        durationWeeks: content.durationWeeks ?? undefined,
        // Главный результат проекта — публичный URL борда (Requirement 11.1).
        resultImageUrl: boardPublicUrl,
        views,
        materials: content.materials,
        estimate: content.estimate,
        solutions: content.solutions,
        colorPalette: content.colorPalette,
        h1: content.h1 ?? undefined,
        seoTitle: content.seoTitle ?? undefined,
        seoDescription: content.seoDescription ?? undefined,
        description: content.description ?? undefined,
        // SEO_Page готова и публична (Requirement 11.1).
        status: "completed",
        isPublic: true,
        progress: 100,
      })
      .returning({ id: designsTable.id });

    const designId = inserted[0]?.id;
    return { published: true, boardPublicUrl, designId };
  } catch (e) {
    // БД недоступна в момент публикации (Requirement 11.4): пропуск без
    // падения, URL борда сохраняется для повторной публикации (Req 11.5).
    const reason = e instanceof Error ? e.message : String(e);
    return skip(
      boardPublicUrl,
      `Публикация пропущена: БД недоступна (${reason})`,
    );
  }
}
