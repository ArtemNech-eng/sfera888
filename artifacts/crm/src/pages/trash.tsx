import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
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

interface TrashItem {
  id: number;
  type: "master" | "order" | "lead";
  title: string;
  subtitle: string;
  deletedAt: string;
  daysLeft: number;
}

interface TrashData {
  masters: TrashItem[];
  orders: TrashItem[];
  leads: TrashItem[];
}

function daysLeftColor(days: number) {
  if (days <= 3) return "destructive";
  if (days <= 7) return "secondary";
  return "outline";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function TrashSection({ label, items, onRestore, onDelete }: {
  label: string;
  items: TrashItem[];
  onRestore: (item: TrashItem) => void;
  onDelete: (item: TrashItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-base font-semibold text-foreground/70 mb-3 flex items-center gap-2">
        {label}
        <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
      </h2>
      <div className="space-y-2">
        {items.map(item => (
          <div
            key={`${item.type}-${item.id}`}
            className="flex items-center gap-4 bg-card rounded-xl border border-border/60 px-4 py-3"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{item.title}</p>
              <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Удалено: {formatDate(item.deletedAt)}</p>
            </div>

            <Badge variant={daysLeftColor(item.daysLeft)} className="shrink-0 text-xs">
              {item.daysLeft === 0 ? "Удаляется сегодня" : `${item.daysLeft} дн.`}
            </Badge>

            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => onRestore(item)}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Восстановить
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Удалить
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить навсегда?</AlertDialogTitle>
                    <AlertDialogDescription>
                      «{item.title}» будет удалён без возможности восстановления.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => onDelete(item)}
                    >
                      Удалить навсегда
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TrashPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<TrashData>({
    queryKey: ["/api/trash"],
    queryFn: () => fetch("/api/trash", { credentials: "include" }).then(r => r.json()),
  });

  const restoreMut = useMutation({
    mutationFn: (item: TrashItem) =>
      fetch(`/api/trash/restore/${item.type}/${item.id}`, { method: "PATCH", credentials: "include" }),
    onSuccess: (_, item) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trash"] });
      queryClient.invalidateQueries({ queryKey: ["/api/masters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Восстановлено", description: `«${item.title}» возвращён из корзины` });
    },
    onError: () => toast({ title: "Ошибка", description: "Не удалось восстановить", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (item: TrashItem) =>
      fetch(`/api/trash/${item.type}/${item.id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: (_, item) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trash"] });
      toast({ title: "Удалено", description: `«${item.title}» удалён навсегда` });
    },
    onError: () => toast({ title: "Ошибка", description: "Не удалось удалить", variant: "destructive" }),
  });

  const total = (data?.masters?.length ?? 0) + (data?.orders?.length ?? 0) + (data?.leads?.length ?? 0);

  return (
    <ProtectedRoute allowedRoles={["admin", "master_operator", "lead_operator"]} permissionKey="trash">
      <Layout>
        <div className="p-6 max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Корзина</h1>
              <p className="text-sm text-muted-foreground">Элементы хранятся 30 дней, затем удаляются автоматически</p>
            </div>
          </div>

          {isLoading && (
            <div className="text-center py-16 text-muted-foreground text-sm">Загрузка…</div>
          )}

          {!isLoading && total === 0 && (
            <div className="text-center py-20">
              <Trash2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Корзина пуста</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Удалённые мастера, заказы и заявки появятся здесь</p>
            </div>
          )}

          {data && (
            <>
              {(data.masters ?? []).some(m => m.daysLeft <= 3) && (
                <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-xl px-4 py-3 mb-6 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Некоторые записи будут удалены в ближайшие 3 дня — восстановите их сейчас.
                </div>
              )}

              <TrashSection
                label="Мастера"
                items={data.masters ?? []}
                onRestore={item => restoreMut.mutate(item)}
                onDelete={item => deleteMut.mutate(item)}
              />
              <TrashSection
                label="Заказы"
                items={data.orders ?? []}
                onRestore={item => restoreMut.mutate(item)}
                onDelete={item => deleteMut.mutate(item)}
              />
              <TrashSection
                label="Заявки"
                items={data.leads ?? []}
                onRestore={item => restoreMut.mutate(item)}
                onDelete={item => deleteMut.mutate(item)}
              />
            </>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
