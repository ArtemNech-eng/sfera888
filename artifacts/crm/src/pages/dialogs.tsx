import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { Loader2, ExternalLink, CheckCircle2, Clock, MessageSquare, Image } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DialogEntry {
  id: number;
  token: string;
  orderId: number;
  clientName: string;
  clientPhone: string;
  serviceType: string;
  city: string;
  district: string | null;
  totalAmount: number;
  prepaymentAmount: number;
  createdAt: string;
  publicUrl: string;
  clientSubmittedName: string | null;
  prepaymentSubmittedAt: string | null;
  prepaymentScreenshotUrl: string | null;
  prepaymentSeenAt: string | null;
  masterAlias: string | null;
  masterFullName: string | null;
  masterPhone: string | null;
}

function DialogsContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ dialogs: DialogEntry[]; unreadCount: number }>({
    queryKey: ["/api/receipts/dialogs"],
    queryFn: () => fetch("/api/receipts/dialogs", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 20_000,
  });

  const confirmPayment = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/receipts/${id}/confirm`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ operatorNote: "Подтверждено оператором" }) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts/dialogs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/receipts/dialogs/unread-count"] });
      toast({ title: "✅ Оплата подтверждена!" });
    },
    onError: () => toast({ title: "Ошибка", variant: "destructive" }),
  });

  const dialogs = data?.dialogs ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <Layout>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <MessageSquare className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Диалоги с клиентами</h1>
            <p className="text-sm text-muted-foreground">Подтверждения предоплаты от клиентов</p>
          </div>
          {unread > 0 && (
            <span className="ml-auto flex items-center gap-1 text-xs font-semibold bg-primary text-white px-2.5 py-1 rounded-full">
              {unread} новых
            </span>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && dialogs.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Подтверждений пока нет</p>
            <p className="text-sm mt-1">Когда клиент подтвердит предоплату — диалог появится здесь</p>
          </div>
        )}

        <div className="space-y-4">
          {dialogs.map(d => {
            const isNew = !d.prepaymentSeenAt;
            const submittedDate = d.prepaymentSubmittedAt
              ? new Date(d.prepaymentSubmittedAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
              : "";

            return (
              <div
                key={d.id}
                className={`bg-card border rounded-2xl overflow-hidden shadow-sm transition-all ${isNew ? "border-primary/40 ring-1 ring-primary/20" : "border-border"}`}
              >
                {/* Header */}
                <div className={`px-5 py-3.5 flex items-center justify-between ${isNew ? "bg-primary/5" : "bg-muted/30"}`}>
                  <div className="flex items-center gap-2">
                    {isNew
                      ? <span className="flex items-center gap-1 text-xs font-bold text-primary"><Clock className="w-3.5 h-3.5" /> Новое</span>
                      : <span className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Просмотрено</span>
                    }
                    <span className="text-xs text-muted-foreground">· {submittedDate}</span>
                  </div>
                  <a href={d.publicUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-500 flex items-center gap-1 hover:underline">
                    <ExternalLink className="w-3 h-3" /> Расписка #{d.id}
                  </a>
                </div>

                <div className="px-5 py-4 space-y-4">
                  {/* Client info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Клиент (из заказа)</p>
                      <p className="text-sm font-semibold">{d.clientName}</p>
                      <p className="text-xs text-muted-foreground">{d.clientPhone}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">ФИО указал клиент</p>
                      <p className="text-sm font-semibold text-primary">{d.clientSubmittedName ?? "—"}</p>
                    </div>
                  </div>

                  {/* Order info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Заказ</p>
                      <p className="text-sm">#{d.orderId} · {d.serviceType}</p>
                      <p className="text-xs text-muted-foreground">{d.city}{d.district ? `, ${d.district}` : ""}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Сумма</p>
                      <p className="text-sm font-bold text-primary">{Number(d.prepaymentAmount).toLocaleString("ru-RU")} ₽ <span className="text-xs text-muted-foreground font-normal">предоплата</span></p>
                      <p className="text-xs text-muted-foreground">Итого: {Number(d.totalAmount).toLocaleString("ru-RU")} ₽</p>
                    </div>
                  </div>

                  {/* Master */}
                  {d.masterAlias && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Мастер</p>
                      <p className="text-sm">{d.masterFullName ?? d.masterAlias}{d.masterPhone ? ` · ${d.masterPhone}` : ""}</p>
                    </div>
                  )}

                  {/* Screenshot */}
                  {d.prepaymentScreenshotUrl ? (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Скриншот оплаты</p>
                      <a href={d.prepaymentScreenshotUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={d.prepaymentScreenshotUrl}
                          alt="Скриншот оплаты"
                          className="max-h-64 rounded-xl border border-border object-contain hover:opacity-90 transition-opacity cursor-pointer"
                        />
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-xl px-4 py-3">
                      <Image className="w-4 h-4" />
                      Скриншот не прикреплён
                    </div>
                  )}

                  {/* Action */}
                  {isNew && (
                    <button
                      onClick={() => confirmPayment.mutate(d.id)}
                      disabled={confirmPayment.isPending}
                      className="w-full h-10 rounded-xl bg-green-600 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-green-700"
                    >
                      {confirmPayment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Подтвердить оплату
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}

export default function DialogsPage() {
  return (
    <ProtectedRoute>
      <DialogsContent />
    </ProtectedRoute>
  );
}
