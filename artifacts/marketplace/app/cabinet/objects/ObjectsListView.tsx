"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cabinetObjects, type ObjectSummary } from "../_lib/cabinetClient";
import { resolvePhotoUrl } from "../_lib/photo";

function money(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

/**
 * `/cabinet/objects` — сетка Объектов мастера.
 *
 * Грузим на маунте, показываем карточки с обложкой, статусом (черновик /
 * опубликован) и меткой попадания в аналитику цен. Редактирование живёт на
 * странице заказа, поэтому карточка ведёт в `/cabinet/orders/[id]/object`.
 */
export function ObjectsListView() {
  const [items, setItems] = useState<ObjectSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await cabinetObjects.list();
        if (cancelled) return;
        setItems(res);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Не удалось загрузить Объекты";
        setError(msg);
        toast.error(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = items?.length ?? 0;
  const published = items?.filter((i) => i.isPublished).length ?? 0;
  const indexable = items?.filter((i) => i.isIndexable).length ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">Real Price</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">Мои Объекты</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">
          Карточки завершённых заказов со сметой по этапам и фото. Опубликованные становятся страницами-кейсами и
          формируют честную статистику цен в вашем городе.
        </p>
        {total > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Stat label="Всего" value={total} />
            <Stat label="Опубликовано" value={published} tone="emerald" />
            <Stat label="В аналитике цен" value={indexable} tone="primary" />
          </div>
        ) : null}
      </header>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-[var(--color-background)]" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-[var(--color-muted)]">{error}</p>
      ) : total === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items!.map((it) => (
            <ObjectCard key={it.id} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}

function ObjectCard({ item }: { item: ObjectSummary }) {
  const meta = [item.city, item.zhk, item.area ? `${item.area} м²` : null].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/cabinet/orders/${item.orderId}/object`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--color-primary)] hover:shadow-md"
    >
      <div className="relative aspect-[4/3] bg-[var(--color-background)]">
        {item.coverPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolvePhotoUrl(item.coverPhoto)}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl opacity-40">📇</div>
        )}
        <span className="absolute left-2 top-2">
          <StatusPill published={item.isPublished} />
        </span>
        {item.isIndexable ? (
          <span className="absolute right-2 top-2 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
            в аналитике цен
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-1 text-sm font-bold text-[var(--color-text)]">{item.serviceType}</h3>
        {meta ? <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-muted)]">{meta}</p> : null}
        <div className="mt-auto flex items-end justify-between pt-3">
          <span className="text-xs text-[var(--color-muted)]">
            {item.stagesCount > 0 ? `${item.stagesCount} эт.` : "черновик"}
          </span>
          <span className="text-base font-black text-[var(--color-text)]">{money(item.totalAmount)} ₽</span>
        </div>
      </div>
    </Link>
  );
}

function StatusPill({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
      Опубликован
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
      Черновик
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "primary" }) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "primary"
        ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
        : "bg-[var(--color-background)] text-[var(--color-muted)]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      <span className="font-black">{value}</span>
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white/50 p-10 text-center">
      <div className="text-4xl">📇</div>
      <h2 className="mt-3 text-base font-bold text-[var(--color-text)]">Пока нет Объектов</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--color-muted)]">
        Откройте активный или завершённый заказ и нажмите «Карточка Объекта», чтобы собрать смету по этапам и
        опубликовать кейс.
      </p>
      <Link
        href="/cabinet/orders"
        className="mt-5 inline-flex items-center rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
      >
        К заказам
      </Link>
    </div>
  );
}
