import type { Metadata } from "next";
import { ObjectEditor } from "./ObjectEditor";

export const metadata: Metadata = { title: "Карточка Объекта" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/orders/[id]/object` — редактор карточки Объекта (Real Price).
 *
 * Мастер превращает завершённый заказ в публичный кейс: смета по этапам,
 * фото до/после, параметры (тип, площадь, ЖК) и публикация. Опубликованный
 * Объект получает страницу `/raboty/{slug}` и подаёт нормализованные ценовые
 * точки в агрегаты цен (петля Real Price).
 */
export default async function CabinetObjectEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = parseInt(id, 10);
  return <ObjectEditor orderId={Number.isFinite(numericId) ? numericId : null} />;
}
