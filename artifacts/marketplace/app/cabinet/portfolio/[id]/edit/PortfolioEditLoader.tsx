"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cabinetPortfolio, type PortfolioItem } from "../../../_lib/cabinetClient";
import { PortfolioEditor } from "../../_PortfolioEditor";

interface Props {
  id: number | null;
  masterCity?: string | null;
}

/**
 * Client-side loader for the edit page. Fetches the master's full portfolio
 * list (capped at 30 items) and looks up the case by id, then mounts the
 * editor with `existingItem` populated.
 */
export function PortfolioEditLoader({ id, masterCity }: Props) {
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await cabinetPortfolio.list();
        if (cancelled) return;
        setItems(res.items);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Не удалось загрузить кейс";
        setError(msg);
        toast.error(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const item = useMemo(() => {
    if (!items || id == null) return null;
    return items.find((i) => i.id === id) ?? null;
  }, [items, id]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="inline-block h-9 w-9 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-muted)]">
        {error}.{" "}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-semibold text-[var(--color-primary)] hover:underline"
        >
          Попробовать ещё раз
        </button>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
        <p className="text-base font-semibold text-[var(--color-text)]">
          Кейс не найден
        </p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Возможно, его удалили или он принадлежит другому мастеру.
        </p>
        <Link
          href="/cabinet/portfolio"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-primary-strong)]"
        >
          К списку кейсов
        </Link>
      </div>
    );
  }

  return <PortfolioEditor existingItem={item} masterCity={masterCity ?? null} />;
}
