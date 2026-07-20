import type { Metadata } from "next";
import { ObjectsListView } from "./ObjectsListView";

export const metadata: Metadata = { title: "Мои Объекты" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/objects` — хаб Объектов мастера (Real Price).
 *
 * Все карточки-кейсы: черновики и опубликованные. Отсюда мастер видит статус,
 * попадание в аналитику цен и переходит к редактированию (через заказ) или на
 * живую страницу кейса.
 */
export default function CabinetObjectsPage() {
  return <ObjectsListView />;
}
