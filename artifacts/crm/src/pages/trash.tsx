import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2, RotateCcw, AlertTriangle, ShieldAlert, Loader2, PackageOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

interface TrashItem {
  id: number;
  type: "master" | "order" | "lead";
  title: string;
  subtitle: string;
  deletedAt: string;
  daysLeft: number;
  blockedByOrders?: number;
}

interface TrashData {
  masters: TrashItem[];
  orders: TrashItem[];
  leads: TrashItem[];
}

function daysLeftBadge(days: number) {
  if (days === 0) return { variant: "destructive" as const, label: "Удаляется сегодня" };
  if (days <= 3)  return { variant: "destructive" as const, label: `${days} дн.` };
  if (days <= 7)  return { variant: "secondary" as const,   label: `${days} дн.` };
  return           { variant: "outline" as const,            label: `${days} дн.` };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function TrashItemRow({
  item,
  onRestore,
  onDelete,
  restoring,
  deleting,
}: {
  item: TrashItem;
  onRestore: () => void;
  onDelete: () => void;
  restoring: boolean;
  deleting: boolean;
}) {
  const badge = daysLeftBadge(item.daysLeft);
  const isBlocked = (item.blockedByOrders ?? 0) > 0;

  return (
    <div className="flex items-center gap-3 bg-card rounded-xl border border-border/60 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{item.title}</p>
        <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Удалено: {formatDate(item.deletedAt)}</p>
        {isBlocked && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" />
            Есть {item.blockedByOrders} активных заказ{item.blockedByOrders === 1 ? "" : "а"} — нельзя удалить навсегда
          </p>
        )}
      </div>

      <Badge variant={badge.variant} className="shrink-0 text-xs whitespace-nowrap">
        {badge.label}
      </Badge>

      <div className="flex gap-1.5 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5"
          onClick={onRestore}
          disabled={restoring || deleting}
        >
          {restoring
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RotateCcw className="w-3.5 h-3.5" />}
          Восстановить
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
              disabled={restoring || deleting || isBlocked}
              title={isBlocked ? "Сначала удалите активные заказы" : undefined}
            >
              {deleting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5" />}
              Удалить
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить навсегда?</AlertDialogTitle>
              <AlertDialogDescription>
                «{item.title}» будет удалён без возможности восстановления. Это действие необратимо.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onDelete}
              >
                Удалить навсегда
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function TrashSection({ label, items, onRestore, onDelete, loadingId }: {
  label: string;
  items: TrashItem[];
  onRestore: (item: TrashItem) => void;
  onDelete: (item: TrashItem) => void;
  loadingId: { id: number; action: "restore" | "delete" } | null;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-foreground/60 mb-2.5 flex items-center gap-2 uppercase tracking-wide">
        {label}
        <span className="text-xs font-normal normal-case text-muted-foreground">({items.length})</span>
      </h2>
      <div className="space-y-2">
        {items.map(item => (
          <TrashItemRow
            key={`${item.type}-${item.id}`}
            item={item}
            onRestore={() => onRestore(item)}
            onDelete={() => onDelete(item)}
            restoring={loadingId?.id === item.id && loadingId.action === "restore"}
            deleting={loadingId?.id === item.id && loadingId.action === "delete"}
          />
        ))}
      </div>
    </div>
  );
}

export default function TrashPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [loadingId, setLoadingId] = useState<{ id: number; action: "restore" | "delete" } | null>(null);

  const { data, isLoading } = useQuery<TrashData>({
    queryKey: ["/api/trash"],
    queryFn: async () => {
      const r = await fetch("/api/trash", { credentials: "include" });
      if (!r.ok) throw new Error("Ошибка загрузки");
      return r.json();
    },
  });

  const restoreMut = useMutation({
    mutationFn: async (item: TrashItem) => {
      setLoadingId({ id: item.id, action: "restore" });
      const r = await fetch(`/api/trash/restore/${item.type}/${item.id}`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Ошибка восстановления");
      }
      return item;
    },
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trash"] });
      queryClient.invalidateQueries({ queryKey: ["/api/masters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Восстановлено", description: `«${item.title}» возвращён из корзины` });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
    onSettled: () => setLoadingId(null),
  });

  const deleteMut = useMutation({
    mutationFn: async (item: TrashItem) => {
      setLoadingId({ id: item.id, action: "delete" });
      const r = await fetch(`/api/trash/${item.type}/${item.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Ошибка удаления");
      }
      return item;
    },
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trash"] });
      toast({ title: "Удалено навсегда", description: `«${item.title}» удалён без возможности восстановления` });
    },
    onError: (e: Error) => toast({ title: "Ошибка удаления", description: e.message, variant: "destructive" }),
    onSettled: () => setLoadingId(null),
  });

  const allItems = [
    ...(data?.masters ?? []),
    ...(data?.orders ?? []),
    ...(data?.leads ?? []),
  ];
  const total = allItems.length;
  const urgentCount = allItems.filter(i => i.daysLeft <= 3).length;

  return (
    <ProtectedRoute allowedRoles={["admin", "master_operator", "lead_operator"]} permissionKey="trash">
      <Layout>
        <div className="p-6 max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  Корзина
                  {total > 0 && (
                    <span className="text-sm font-normal text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      {total}
                    </span>
                  )}
                </h1>
                <p className="text-sm text-muted-foreground">Элементы хранятся 30 дней, затем удаляются автоматически</p>
              </div>
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Загрузка…
            </div>
          )}

          {!isLoading && total === 0 && (
            <div className="text-center py-20">
              <PackageOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Корзина пуста</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Удалённые мастера, заказы и заявки появятся здесь</p>
            </div>
          )}

          {data && total > 0 && (
            <>
              {/* Urgent warning — covers all types */}
              {urgentCount > 0 && (
                <div className="flex items-start gap-2.5 bg-destructive/10 text-destructive rounded-xl px-4 py-3 mb-5 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {urgentCount === 1
                      ? "1 запись будет удалена в ближайшие 3 дня"
                      : `${urgentCount} записи будут удалены в ближайшие 3 дня`}
                    {" "}— восстановите их сейчас, если нужно.
                  </span>
                </div>
              )}

              <TrashSection
                label="Мастера"
                items={data.masters ?? []}
                onRestore={item => restoreMut.mutate(item)}
                onDelete={item => deleteMut.mutate(item)}
                loadingId={loadingId}
              />
              <TrashSection
                label="Заказы"
                items={data.orders ?? []}
                onRestore={item => restoreMut.mutate(item)}
                onDelete={item => deleteMut.mutate(item)}
                loadingId={loadingId}
              />
              <TrashSection
                label="Заявки"
                items={data.leads ?? []}
                onRestore={item => restoreMut.mutate(item)}
                onDelete={item => deleteMut.mutate(item)}
                loadingId={loadingId}
              />
            </>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
