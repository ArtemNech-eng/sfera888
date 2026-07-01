/**
 * Одноразовая чистка «осиротевших» объектов R2 от удалённых дизайн-проектов.
 *
 * Что делает:
 *   • читает из БД множество существующих `designs.id` и их `input_image_url`
 *     (ключи загруженных пользователем фото);
 *   • листает объекты бакета под префиксом `dizajn/`;
 *   • объект считается «сиротой», если:
 *       - `dizajn/results/{id}_*`  или `dizajn/before/{id}_*` — и `{id}` НЕ
 *         существует в БД;
 *       - `dizajn/uploads/{key}`   — и этот ключ не встречается ни в одном
 *         `designs.input_image_url`.
 *   • по умолчанию РЕЖИМ DRY-RUN (только печатает). С флагом `--apply` удаляет.
 *
 * Запуск (на сервере, где заданы R2_* и DATABASE_URL):
 *   tsx src/scripts/cleanup-orphaned-r2.ts            # dry-run, ничего не трогает
 *   tsx src/scripts/cleanup-orphaned-r2.ts --apply    # реально удаляет
 *
 * Требует env: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * DEFAULT_OBJECT_STORAGE_BUCKET_ID, DATABASE_URL.
 */

import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { db, designsTable } from "@workspace/db";
import { s3Client } from "../lib/objectStorage.js";

const APPLY = process.argv.includes("--apply");
const PREFIX = "dizajn/";

function designIdFromKey(key: string): number | null {
  // dizajn/results/{id}_view_1.jpg  |  dizajn/before/{id}_before.jpg
  const m = key.match(/^dizajn\/(?:results|before)\/(\d+)[_.]/);
  return m ? Number(m[1]) : null;
}

async function main(): Promise<void> {
  const bucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucket) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");

  // 1. Существующие дизайны + ключи их загруженных фото.
  const rows = await db
    .select({ id: designsTable.id, input: designsTable.inputImageUrl })
    .from(designsTable);
  const liveIds = new Set<number>(rows.map((r) => r.id));
  const liveUploadKeys = new Set<string>();
  for (const r of rows) {
    if (r.input) liveUploadKeys.add(r.input.replace(/^\/+/, ""));
  }
  console.log(
    `[cleanup-r2] live designs=${liveIds.size}, live upload keys=${liveUploadKeys.size}, mode=${
      APPLY ? "APPLY (will delete)" : "DRY-RUN"
    }`,
  );

  // 2. Листаем весь префикс `dizajn/` (с пагинацией).
  const orphans: string[] = [];
  let kept = 0;
  let token: string | undefined = undefined;
  do {
    const resp: ListObjectsV2CommandOutput = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PREFIX,
        ContinuationToken: token,
      }),
    );
    for (const obj of resp.Contents ?? []) {
      const key = obj.Key;
      if (!key) continue;
      const id = designIdFromKey(key);
      let orphan: boolean;
      if (id != null) {
        orphan = !liveIds.has(id);
      } else if (key.startsWith("dizajn/uploads/")) {
        orphan = !liveUploadKeys.has(key);
      } else {
        // Неизвестный шаблон под dizajn/ — на всякий случай НЕ трогаем.
        orphan = false;
      }
      if (orphan) orphans.push(key);
      else kept++;
    }
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);

  console.log(`[cleanup-r2] kept=${kept}, orphans=${orphans.length}`);
  for (const k of orphans) console.log(`  orphan: ${k}`);

  if (!APPLY) {
    console.log("[cleanup-r2] DRY-RUN — nothing deleted. Re-run with --apply to delete.");
    return;
  }
  if (orphans.length === 0) {
    console.log("[cleanup-r2] nothing to delete.");
    return;
  }

  // 3. Удаляем батчами по 1000 (лимит DeleteObjects).
  let deleted = 0;
  for (let i = 0; i < orphans.length; i += 1000) {
    const batch = orphans.slice(i, i + 1000);
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    deleted += batch.length;
    console.log(`[cleanup-r2] deleted ${deleted}/${orphans.length}`);
  }
  console.log(`[cleanup-r2] done. deleted=${deleted}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[cleanup-r2] failed:", e);
    process.exit(1);
  });
