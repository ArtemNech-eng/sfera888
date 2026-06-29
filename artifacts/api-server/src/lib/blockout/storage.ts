/**
 * Загрузка артефактов пайплайна AI_Design_3D_Blockout (подход B2) в R2
 * (`Object_Storage`).
 *
 * См. `.kiro/specs/ai-design-3d-blockout/design.md` секции «Components and
 * Interfaces → Хранилище R2» и шаги пайплайна 4 (`uploadDepthMaps`) и 7
 * (`uploadBoard`), а также `requirements.md` Requirement 10
 * (загрузка результата в R2).
 *
 * Что делает этот модуль (задача 10.1):
 *   • `uploadDepthMaps(depthMaps, opts)` — грузит каждую `Depth_Map` в R2 и
 *     возвращает публичные URL (по одному на камеру), которые далее
 *     передаются в `Depth_ControlNet_Provider` как управляющий сигнал
 *     (Requirement 10.1);
 *   • `uploadBoard(board, opts)` — грузит итоговый борд в R2 и возвращает его
 *     публичный URL (Requirement 10.1, 10.2);
 *   • `assertStorageEnv()` — проверяет обязательные переменные окружения
 *     `Object_Storage` и при отсутствии любой из них бросает ошибку, чьё
 *     сообщение называет именно эту отсутствующую переменную (Requirement 10.3,
 *     Property 20).
 *
 * Загрузка идёт через существующий `objectStorage.ts`
 * (`objectStorageClient.bucket(id).file(key).save(buffer, { contentType })`),
 * как и в `designWorker.ts` / `topDownPlan.ts` / `generate-design-board.ts`.
 * Публичный URL строится из `R2_PUBLIC_URL` (без хвостовых слэшей) + ключ.
 *
 * Контракт `objectStorage.ts` НЕ изменяется. Импорт клиента — динамический,
 * чтобы валидация окружения (`assertStorageEnv`) выполнялась первой и
 * детерминированно называла отсутствующую переменную, не натыкаясь на
 * инициализацию S3-клиента на этапе загрузки модуля.
 */

/**
 * Обязательные переменные окружения `Object_Storage` в порядке проверки.
 *
 * Источник списка — `requirements.md` (определение `Object_Storage`) и
 * design §«Хранилище R2». `FAL_API_KEY` относится к провайдеру перекраски,
 * а не к загрузке в R2, поэтому здесь не проверяется.
 */
export const REQUIRED_STORAGE_ENV_VARS = [
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_URL",
  "DEFAULT_OBJECT_STORAGE_BUCKET_ID",
] as const;

/** Имя обязательной переменной окружения хранилища. */
export type StorageEnvVar = (typeof REQUIRED_STORAGE_ENV_VARS)[number];

/** Префикс ключей всех артефактов блокаута в бакете. */
const KEY_ROOT = "blockout";

/** Одна `Depth_Map` для загрузки: PNG-буфер плюс id камеры `Camera_Rig`. */
export interface DepthMapUpload {
  /** Идентификатор камеры (например, `cam_persp_1`, `cam_iso`, `cam_top`). */
  cameraId: string;
  /** Содержимое карты глубины в формате PNG. */
  png: Buffer;
}

/** Параметры загрузки, общие для артефактов одного проекта. */
export interface UploadOptions {
  /**
   * Идентификатор проекта B2 — используется как сегмент ключа, чтобы
   * артефакты разных проектов не пересекались в бакете.
   */
  projectId: string;
}

/** Разрешённая конфигурация хранилища после успешной валидации env. */
interface ResolvedStorageEnv {
  bucketId: string;
  publicBaseUrl: string;
}

/**
 * Проверяет обязательные переменные окружения `Object_Storage` и возвращает
 * разрешённую конфигурацию.
 *
 * Переменные проверяются в фиксированном порядке
 * (`REQUIRED_STORAGE_ENV_VARS`); при первой незаданной (пустой или из одних
 * пробелов) бросается ошибка, чьё сообщение содержит имя именно этой
 * переменной (Requirement 10.3, Property 20).
 *
 * @throws Error если любая обязательная переменная не задана.
 */
export function assertStorageEnv(): ResolvedStorageEnv {
  for (const name of REQUIRED_STORAGE_ENV_VARS) {
    const value = process.env[name];
    if (value === undefined || value.trim() === "") {
      throw new Error(
        `Object_Storage: переменная окружения ${name} не задана`,
      );
    }
  }

  return {
    bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID as string,
    // R2_PUBLIC_URL без хвостовых слэшей — как в designWorker.ts/topDownPlan.ts.
    publicBaseUrl: (process.env.R2_PUBLIC_URL as string).replace(/\/+$/, ""),
  };
}

/** Строит публичный URL артефакта из базового URL R2 и ключа объекта. */
function toPublicUrl(publicBaseUrl: string, key: string): string {
  return `${publicBaseUrl}/${key}`;
}

/**
 * Загружает один PNG-объект в R2 через существующий `objectStorage.ts`.
 *
 * Клиент импортируется динамически, чтобы `assertStorageEnv` (вызванная ранее)
 * оставалась единственным источником ошибок о незаданных переменных.
 */
async function savePng(
  bucketId: string,
  key: string,
  png: Buffer,
): Promise<void> {
  const { objectStorageClient } = await import("../objectStorage");
  await objectStorageClient
    .bucket(bucketId)
    .file(key)
    .save(png, { contentType: "image/png" });
}

/**
 * Грузит каждую `Depth_Map` в R2 и возвращает её публичный URL
 * (Requirement 10.1).
 *
 * Порядок результата соответствует порядку входных карт (по одной на камеру).
 * Ключ объекта детерминирован: `blockout/<projectId>/depth/<cameraId>.png`.
 *
 * @throws Error если любая обязательная переменная окружения `Object_Storage`
 *   не задана (Requirement 10.3) — проверяется до любой загрузки.
 */
export async function uploadDepthMaps(
  depthMaps: DepthMapUpload[],
  opts: UploadOptions,
): Promise<string[]> {
  const { bucketId, publicBaseUrl } = assertStorageEnv();

  const urls: string[] = [];
  for (const depthMap of depthMaps) {
    const key = `${KEY_ROOT}/${opts.projectId}/depth/${depthMap.cameraId}.png`;
    await savePng(bucketId, key, depthMap.png);
    urls.push(toPublicUrl(publicBaseUrl, key));
  }
  return urls;
}

/**
 * Грузит итоговый борд в R2 и возвращает его публичный URL
 * (Requirement 10.1, 10.2).
 *
 * Ключ объекта детерминирован: `blockout/<projectId>/board.png`.
 *
 * @throws Error если любая обязательная переменная окружения `Object_Storage`
 *   не задана (Requirement 10.3) — проверяется до загрузки.
 */
export async function uploadBoard(
  board: Buffer,
  opts: UploadOptions,
): Promise<string> {
  const { bucketId, publicBaseUrl } = assertStorageEnv();

  const key = `${KEY_ROOT}/${opts.projectId}/board.png`;
  await savePng(bucketId, key, board);
  return toPublicUrl(publicBaseUrl, key);
}

/** Один PNG-артефакт перекраски/сравнения: id камеры + содержимое PNG. */
export interface RepaintUpload {
  /** Идентификатор камеры (например, `cam_persp_1`). */
  cameraId: string;
  /** Содержимое изображения в формате PNG. */
  png: Buffer;
}

/**
 * Грузит набор PNG-артефактов в R2 под общим под-сегментом ключа и возвращает
 * их публичные URL в порядке входа (по одному на камеру).
 *
 * Ключ объекта детерминирован: `blockout/<projectId>/<subdir>/<cameraId>.png`.
 * Используется внутренне `uploadRepaints` и `uploadFallback2D`, чтобы артефакты
 * разных типов (перекраска / 2D-сравнение) не пересекались с входными
 * `Depth_Map` в бакете.
 *
 * @throws Error если любая обязательная переменная окружения `Object_Storage`
 *   не задана (Requirement 10.3) — проверяется до любой загрузки.
 */
async function uploadKeyedPngs(
  items: RepaintUpload[],
  opts: UploadOptions,
  subdir: string,
): Promise<string[]> {
  const { bucketId, publicBaseUrl } = assertStorageEnv();

  const urls: string[] = [];
  for (const item of items) {
    const key = `${KEY_ROOT}/${opts.projectId}/${subdir}/${item.cameraId}.png`;
    await savePng(bucketId, key, item.png);
    urls.push(toPublicUrl(publicBaseUrl, key));
  }
  return urls;
}

/**
 * Грузит каждый `Photoreal_Repaint` в R2 и возвращает его публичный URL
 * (Requirement 1.3, 10.1).
 *
 * Ключ объекта детерминирован: `blockout/<projectId>/repaint/<cameraId>.png`.
 *
 * @throws Error если любая обязательная переменная окружения `Object_Storage`
 *   не задана (Requirement 10.3) — проверяется до любой загрузки.
 */
export async function uploadRepaints(
  repaints: RepaintUpload[],
  opts: UploadOptions,
): Promise<string[]> {
  return uploadKeyedPngs(repaints, opts, "repaint");
}

/**
 * Грузит артефакты `Fallback_2D_Path` (2D-сравнение) в R2 и возвращает их
 * публичные URL (Requirement 1.4).
 *
 * Ключ объекта детерминирован: `blockout/<projectId>/fallback2d/<cameraId>.png`.
 *
 * @throws Error если любая обязательная переменная окружения `Object_Storage`
 *   не задана (Requirement 10.3) — проверяется до любой загрузки.
 */
export async function uploadFallback2D(
  items: RepaintUpload[],
  opts: UploadOptions,
): Promise<string[]> {
  return uploadKeyedPngs(items, opts, "fallback2d");
}
