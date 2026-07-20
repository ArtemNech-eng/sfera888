/**
 * Объект (Real Price) — общий сервис создания/редактирования/публикации.
 * Spec: `.kiro/specs/real-price`.
 *
 * Зачем отдельный модуль: карточку Объекта редактируют из ДВУХ клиентов —
 *   • standalone master-pwa (sfera-master.ru, same-origin → `/api/receipts/*`);
 *   • кабинет мастера на маркетплейсе (chestnye-mastera.ru), который ходит
 *     только через прокси `/api/cabinet/*` → `/master-pwa/*`.
 * Чтобы не дублировать бизнес-логику (валидация этапов, синк заказа/FOMO,
 * генерация slug, нормализация ценовых точек, пересчёт агрегатов), она собрана
 * здесь. Роуты остаются тонкими и только маппят HTTP ↔ ServiceResult.
 *
 * Модель: 1 заказ = 1 Объект = 1 (последняя) расписка `receipts`. Смета
 * «дорастает» до Объекта — поля аддитивны, классический receipt-флоу не
 * затрагивается.
 */

import {
  db,
  receiptsTable,
  ordersTable,
  mastersTable,
  leadsTable,
  pricePointsTable,
  workTypesTable,
  type ObjectStage,
} from "@workspace/db";
import { eq, and, isNull, asc, desc } from "drizzle-orm";
import crypto from "crypto";
import { slugify } from "./slug.js";
import { stagesToLineItems, stagesTotal, stageLinesToPoints, type ObjStage } from "./realPrice.js";
import { recomputePriceAggregates } from "./priceAggregation.js";
import { getCommissionSettings, calculateCommission } from "./commission.js";
import { checkFomoTransition } from "./fomoBlock.js";
import { revalidateMarketplacePaths, casePublicationPaths } from "./marketplaceRevalidate.js";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): ServiceResult<never> => ({ ok: false, status, error });
const done = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

// ─── Словарь видов работ (для пикера позиций этапа) ───────────────────────────

export interface WorkTypeOption {
  id: number;
  slug: string;
  name: string;
  category: string;
  defaultUnit: string | null;
  sortOrder: number;
}

export async function listActiveWorkTypes(): Promise<WorkTypeOption[]> {
  const rows = await db
    .select()
    .from(workTypesTable)
    .where(eq(workTypesTable.isActive, true))
    .orderBy(asc(workTypesTable.sortOrder), asc(workTypesTable.name));
  return rows.map((w) => ({
    id: w.id,
    slug: w.slug,
    name: w.name,
    category: w.category,
    defaultUnit: w.defaultUnit ?? null,
    sortOrder: w.sortOrder,
  }));
}

// ─── Представление Объекта / контекста заказа ─────────────────────────────────

export interface ObjectView {
  id: number;
  orderId: number;
  objectType: string | null;
  serviceType: string;
  city: string;
  district: string | null;
  zhk: string | null;
  area: number | null;
  stages: ObjStage[];
  totalAmount: number;
  notes: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  isIndexable: boolean;
  publishConsent: boolean;
  slug: string | null;
  publicUrl: string | null;
}

function toObjectView(r: typeof receiptsTable.$inferSelect): ObjectView {
  return {
    id: r.id,
    orderId: r.orderId,
    objectType: r.objectType ?? null,
    serviceType: r.serviceType,
    city: r.city,
    district: r.district ?? null,
    zhk: r.zhk ?? null,
    area: r.area != null ? Number(r.area) : null,
    stages: (r.stages as ObjStage[]) ?? [],
    totalAmount: Number(r.totalAmount),
    notes: r.notes ?? null,
    isPublished: r.isPublished,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    isIndexable: r.isIndexable,
    publishConsent: r.publishConsent,
    slug: r.slug ?? null,
    publicUrl: r.isPublished && r.slug ? `/raboty/${r.slug}` : null,
  };
}

export interface ObjectOrderContext {
  orderId: number;
  serviceType: string;
  city: string;
  district: string | null;
  area: number | null;
  status: string;
  completedAt: string | null;
  photosBefore: string[];
  photosAfter: string[];
}

function toOrderContext(o: typeof ordersTable.$inferSelect): ObjectOrderContext {
  return {
    orderId: o.id,
    serviceType: o.serviceType,
    city: o.city,
    district: o.district ?? null,
    area: o.area != null ? Number(o.area) : null,
    status: o.status,
    completedAt: o.completedAt ? o.completedAt.toISOString() : null,
    photosBefore: (o.photosBefore as string[]) ?? [],
    photosAfter: (o.photosAfter as string[]) ?? [],
  };
}

/** Последняя расписка мастера по заказу (расписка = Объект). */
async function latestReceiptForOrder(masterId: number, orderId: number) {
  const [row] = await db
    .select()
    .from(receiptsTable)
    .where(and(eq(receiptsTable.orderId, orderId), eq(receiptsTable.masterId, masterId)))
    .orderBy(desc(receiptsTable.id))
    .limit(1);
  return row ?? null;
}

/** Контекст заказа + Объект (если уже есть) — для экрана редактора. */
export async function getObjectForOrder(
  masterId: number,
  orderId: number,
): Promise<ServiceResult<{ order: ObjectOrderContext; object: ObjectView | null }>> {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.masterId, masterId), isNull(ordersTable.deletedAt)));
  if (!order) return fail(404, "Заказ не найден");
  const receipt = await latestReceiptForOrder(masterId, orderId);
  return done({ order: toOrderContext(order), object: receipt ? toObjectView(receipt) : null });
}

// ─── Список Объектов мастера (хаб «Мои Объекты») ──────────────────────────────

export interface ObjectSummary {
  id: number;
  orderId: number;
  objectType: string | null;
  serviceType: string;
  city: string;
  district: string | null;
  zhk: string | null;
  area: number | null;
  totalAmount: number;
  stagesCount: number;
  isPublished: boolean;
  publishedAt: string | null;
  isIndexable: boolean;
  slug: string | null;
  publicUrl: string | null;
  coverPhoto: string | null;
}

/**
 * Все Объекты мастера (черновики + опубликованные). Объектом считаем расписку
 * со заполненными этапами или уже опубликованную — классические сметы без
 * этапов не показываем. Обложка — первое фото «после» заказа, иначе «до».
 */
export async function listObjectsForMaster(masterId: number): Promise<ObjectSummary[]> {
  const rows = await db
    .select({
      receipt: receiptsTable,
      photosBefore: ordersTable.photosBefore,
      photosAfter: ordersTable.photosAfter,
    })
    .from(receiptsTable)
    .leftJoin(ordersTable, eq(ordersTable.id, receiptsTable.orderId))
    .where(eq(receiptsTable.masterId, masterId));

  const objects = rows.filter((r) => {
    const st = Array.isArray(r.receipt.stages) ? r.receipt.stages : [];
    return st.length > 0 || r.receipt.isPublished;
  });

  const sortKey = (r: (typeof objects)[number]) =>
    (r.receipt.publishedAt ?? r.receipt.createdAt ?? new Date(0)).getTime();
  objects.sort((a, b) => sortKey(b) - sortKey(a));

  return objects.map((r) => {
    const after = (r.photosAfter as string[] | null) ?? [];
    const before = (r.photosBefore as string[] | null) ?? [];
    const st = (Array.isArray(r.receipt.stages) ? r.receipt.stages : []) as ObjStage[];
    const view = toObjectView(r.receipt);
    return {
      id: view.id,
      orderId: view.orderId,
      objectType: view.objectType,
      serviceType: view.serviceType,
      city: view.city,
      district: view.district,
      zhk: view.zhk,
      area: view.area,
      totalAmount: view.totalAmount,
      stagesCount: st.length,
      isPublished: view.isPublished,
      publishedAt: view.publishedAt,
      isIndexable: view.isIndexable,
      slug: view.slug,
      publicUrl: view.publicUrl,
      coverPhoto: after[0] ?? before[0] ?? null,
    };
  });
}

// ─── Создание / редактирование Объекта (upsert по заказу) ─────────────────────

export interface SaveObjectInput {
  orderId?: number;
  stages?: ObjStage[];
  area?: number | string | null;
  zhk?: string | null;
  objectType?: string | null;
  notes?: string | null;
  publishConsent?: boolean;
}

function normalizeArea(area: SaveObjectInput["area"]): string | null | undefined {
  if (area === undefined) return undefined;
  if (area === null || area === "") return null;
  const n = Number(area);
  return Number.isFinite(n) && n > 0 ? String(n) : null;
}

async function syncOrderAfterEstimate(orderId: number, masterId: number, totalAmount: number): Promise<void> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return;
  const patch: Record<string, unknown> = { proposedAmount: String(totalAmount), updatedAt: new Date() };
  if (!order.orderAmount) {
    patch.orderAmount = String(totalAmount);
    const commSettings = await getCommissionSettings();
    patch.commission = String(calculateCommission(totalAmount, commSettings));
  }
  await db.update(ordersTable).set(patch).where(eq(ordersTable.id, orderId));
  checkFomoTransition(masterId, false).catch(() => {});
}

/**
 * Создаёт или обновляет Объект (карточку по этапам) для заказа мастера.
 * Если по заказу уже есть расписка — обновляем её (смета дорастает до Объекта),
 * иначе создаём новую в object-режиме.
 */
export async function saveObject(masterId: number, input: SaveObjectInput): Promise<ServiceResult<ObjectView>> {
  const orderId = Number(input.orderId);
  if (!Number.isFinite(orderId) || orderId <= 0) return fail(400, "Не указан orderId");

  const stages = Array.isArray(input.stages) ? input.stages : [];
  const validItems = stagesToLineItems(stages);
  if (validItems.length === 0) return fail(400, "Добавьте хотя бы один этап с позициями");
  // realPrice.ObjStage допускает частичные поля; в БД колонка типизирована как
  // ObjectStage[] — приводим на границе записи (jsonb хранит как есть).
  const stagesForDb = stages as unknown as ObjectStage[];

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.masterId, masterId), isNull(ordersTable.deletedAt)));
  if (!order) return fail(404, "Заказ не найден");

  const totalAmount = stagesTotal(stages);
  const area = normalizeArea(input.area);
  const zhk = input.zhk === undefined ? undefined : ((typeof input.zhk === "string" && input.zhk.trim()) || null);
  const objectType =
    input.objectType === undefined ? undefined : ((typeof input.objectType === "string" && input.objectType) || null);
  const notes = input.notes === undefined ? undefined : (input.notes?.trim() || null);

  const existing = await latestReceiptForOrder(masterId, orderId);

  let saved: typeof receiptsTable.$inferSelect;
  if (existing) {
    const setFields: Record<string, unknown> = {
      lineItems: validItems,
      totalAmount: String(totalAmount),
      stages: stagesForDb,
    };
    if (area !== undefined) setFields.area = area;
    if (zhk !== undefined) setFields.zhk = zhk;
    if (objectType !== undefined) setFields.objectType = objectType;
    if (notes !== undefined) setFields.notes = notes;
    if (input.publishConsent === true) setFields.publishConsent = true;
    const [updated] = await db.update(receiptsTable).set(setFields).where(eq(receiptsTable.id, existing.id)).returning();
    saved = updated;
  } else {
    const [lead] = order.leadId ? await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId)) : [];
    const token = crypto.randomBytes(20).toString("hex");
    const [created] = await db
      .insert(receiptsTable)
      .values({
        token,
        orderId,
        masterId,
        clientName: lead?.clientName ?? "Клиент",
        clientPhone: lead?.clientPhone ?? "",
        serviceType: order.serviceType,
        city: order.city,
        district: order.district ?? null,
        lineItems: validItems,
        totalAmount: String(totalAmount),
        prepaymentAmount: "0",
        notes: notes ?? null,
        stages: stagesForDb,
        area: area ?? null,
        zhk: zhk ?? null,
        objectType: objectType ?? null,
        publishConsent: input.publishConsent === true,
      })
      .returning();
    saved = created;
  }

  await syncOrderAfterEstimate(orderId, masterId, totalAmount);
  return done(toObjectView(saved));
}

// ─── Публикация Объекта → кейс + ценовые точки + пересчёт агрегатов ───────────

export interface PublishResult {
  slug: string;
  url: string;
  pricePoints: number;
}

/**
 * Публикует завершённый Объект: ставит is_published/is_indexable, генерит slug,
 * из этапов формирует нормализованные price_points и пересчитывает агрегаты —
 * петля Real Price замыкается. Идемпотентно: повторный вызов пере-пишет точки.
 */
export async function publishObjectForMaster(
  masterId: number,
  receiptId: number,
  opts: { consent?: boolean } = {},
): Promise<ServiceResult<PublishResult>> {
  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receiptId));
  if (!receipt || receipt.masterId !== masterId) return fail(404, "Объект не найден");

  const stages = (Array.isArray(receipt.stages) ? receipt.stages : []) as ObjStage[];
  if (stages.length === 0) return fail(400, "Заполните этапы сметы перед публикацией");

  const consent = receipt.publishConsent || opts.consent === true;
  if (!consent) return fail(400, "Нужно согласие клиента на публикацию фото");

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, receipt.orderId));
  const base = slugify([receipt.serviceType, receipt.city, receipt.zhk].filter(Boolean).join("-"));
  const slug = receipt.slug ?? `${base || "obekt"}-${receipt.id}`;
  const points = stageLinesToPoints(stages);
  const closedAt = order?.completedAt ?? new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(receiptsTable)
      .set({
        isPublished: true,
        publishedAt: new Date(),
        isIndexable: true,
        publishConsent: true,
        slug,
        objectType: receipt.objectType ?? "project",
      })
      .where(eq(receiptsTable.id, receiptId));

    await tx.delete(pricePointsTable).where(eq(pricePointsTable.receiptId, receiptId));
    if (points.length > 0) {
      await tx.insert(pricePointsTable).values(
        points.map((p) => ({
          orderId: receipt.orderId,
          receiptId: receipt.id,
          masterId: receipt.masterId,
          workTypeId: p.workTypeId,
          unit: p.unit,
          quantity: p.quantity != null ? String(p.quantity) : null,
          unitPrice: String(p.unitPrice),
          total: String(p.total),
          city: order?.city ?? receipt.city,
          district: order?.district ?? receipt.district ?? null,
          zhk: receipt.zhk ?? null,
          source: receipt.source ?? "platform",
          closedAt,
        })),
      );
    }
  });

  recomputePriceAggregates().catch((e) =>
    console.error("[objectService/publish recompute]", e instanceof Error ? e.message : e),
  );

  // ISR: кейс появляется в ленте /raboty и получает свою страницу.
  const [master] = receipt.masterId
    ? await db.select().from(mastersTable).where(eq(mastersTable.id, receipt.masterId))
    : [];
  revalidateMarketplacePaths(casePublicationPaths(master?.slug ?? null, slug)).catch(() => {});

  return done({ slug, url: `/raboty/${slug}`, pricePoints: points.length });
}
