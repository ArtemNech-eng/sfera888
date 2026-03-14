import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useGetOrders, OrderStatus } from "@workspace/api-client-react";
import { ProtectedRoute } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import {
  Loader2, MapPin, Send, Users, CheckCircle2, Clock, X, UserCheck,
  DollarSign, Check, Pencil, AlertCircle, MessageSquare,
} from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";

interface DispatchInfo {
  dispatchStatus: string;
  dispatches: { id: number; masterId: number; masterName: string; status: string; respondedAt: string | null }[];
}

function useDispatch(orderId: number | null) {
  return useQuery<DispatchInfo>({
    queryKey: ["/api/dispatch", orderId],
    queryFn: async () => {
      const r = await fetch(`/api/dispatch/${orderId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!orderId,
    refetchInterval: 5000,
  });
}

function DispatchBadge({ status }: { status: string }) {
  if (status === "none") return null;
  if (status === "dispatching")
    return <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5 font-medium"><Clock className="w-3 h-3" />Разослано</span>;
  if (status === "assigned")
    return <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-medium"><CheckCircle2 className="w-3 h-3" />Назначен</span>;
  return null;
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

export default function Orders() {
  const [, setLocation] = useLocation();
  const [openDispatchId, setOpenDispatchId] = useState<number | null>(null);
  const [editAmountId, setEditAmountId] = useState<number | null>(null);
  const [editAmountValue, setEditAmountValue] = useState("");
  const queryClient = useQueryClient();

  const openMasterChat = (masterId: number) => setLocation(`/master-chat?masterId=${masterId}`);

  const { data: orders, isLoading } = useGetOrders({}, { query: { refetchInterval: 8000 } });
  const { data: dispatchData, isLoading: dispatchLoading } = useDispatch(openDispatchId);

  const broadcastMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/dispatch/${orderId}/broadcast`, { method: "POST", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", openDispatchId] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ orderId, masterId }: { orderId: number; masterId: number }) => {
      const r = await fetch(`/api/dispatch/${orderId}/assign/${masterId}`, { method: "POST", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", openDispatchId] });
    },
  });

  const acceptProposedMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ acceptProposed: true }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/orders"] }),
  });

  const setAmountMutation = useMutation({
    mutationFn: async ({ orderId, amount }: { orderId: number; amount: number }) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderAmount: amount }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setEditAmountId(null);
      setEditAmountValue("");
    },
  });

  const approveCancellationMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ approveCancellation: true }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/orders"] }),
  });

  const rejectCancellationMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rejectCancellation: true }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/orders"] }),
  });

  interface PendingDispatch {
    orderId: number;
    serviceType: string;
    city: string;
    district: string | null;
    respondentCount: number;
    respondents: { masterId: number; masterName: string; respondedAt: string | null }[];
  }

  const { data: pendingDispatches } = useQuery<PendingDispatch[]>({
    queryKey: ["/api/dispatch/pending"],
    queryFn: async () => {
      const r = await fetch("/api/dispatch/pending", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 6000,
  });

  const openOrder = openDispatchId ? orders?.find(o => o.id === openDispatchId) : null;
  const respondents = dispatchData?.dispatches.filter(d => d.status === "responded") ?? [];

  const pendingAmountOrders = orders?.filter(o => (o as any).proposedAmount && !(o as any).orderAmount) ?? [];
  const cancellationOrders = orders?.filter(o => o.status === "cancellation_requested" as any) ?? [];
  const pendingResponseOrders = pendingDispatches ?? [];

  return (
    <ProtectedRoute allowedRoles={['admin', 'master_operator']}>
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Буфер заказов</h1>
            <p className="text-muted-foreground mt-1">Распределение заказов по мастерам</p>
          </div>

          {/* Cancellation request banner */}
          {cancellationOrders.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-red-800 font-semibold text-sm mb-1">
                <AlertCircle className="w-4 h-4" />
                {cancellationOrders.length === 1
                  ? "1 запрос на отмену заказа"
                  : `${cancellationOrders.length} запроса на отмену заказа`}
              </div>
              {cancellationOrders.map(order => (
                <div key={order.id} className="bg-white rounded-xl border border-red-100 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-foreground">#{order.id}</span>
                      <span className="mx-2 text-muted-foreground">·</span>
                      <span className="text-foreground">{order.serviceType}</span>
                      <span className="mx-2 text-muted-foreground">·</span>
                      <span className="text-muted-foreground text-xs">{order.city}</span>
                      {order.masterName && (
                        <span className="ml-2 text-xs text-muted-foreground">мастер {order.masterName}</span>
                      )}
                    </div>
                    {order.masterId && (
                      <button
                        onClick={() => openMasterChat(order.masterId!)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white hover:bg-red-600 rounded-lg font-medium text-xs transition-colors"
                      >
                        <MessageSquare className="w-3 h-3" />
                        Открыть чат
                      </button>
                    )}
                  </div>
                  {(order as any).cancelReason && (
                    <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
                      <span className="font-medium">Причина: </span>{(order as any).cancelReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pending responses banner */}
          {pendingResponseOrders.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm mb-1">
                <Users className="w-4 h-4" />
                {pendingResponseOrders.length === 1
                  ? `1 заявка — есть отклики от мастеров`
                  : `${pendingResponseOrders.length} заявки — есть отклики от мастеров`}
              </div>
              {pendingResponseOrders.map(item => (
                <div key={item.orderId} className="bg-white rounded-xl border border-blue-100 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                      <span className="font-medium text-foreground">#{item.orderId}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-foreground">{item.serviceType}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground text-xs">{item.city}{item.district ? `, ${item.district}` : ""}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">
                        <UserCheck className="w-3 h-3" />
                        {item.respondentCount} {item.respondentCount === 1 ? "отклик" : item.respondentCount < 5 ? "отклика" : "откликов"}
                      </span>
                    </div>
                    <button
                      onClick={() => setOpenDispatchId(item.orderId)}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white hover:bg-blue-600 rounded-lg font-medium text-xs transition-colors"
                    >
                      <UserCheck className="w-3 h-3" />
                      Назначить мастера
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.respondents.map(r => (
                      <button
                        key={r.masterId}
                        onClick={() => openMasterChat(r.masterId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-lg text-xs font-medium transition-colors"
                      >
                        <MessageSquare className="w-3 h-3" />
                        {r.masterName}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Proposed amount banner */}
          {pendingAmountOrders.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-1">
                <DollarSign className="w-4 h-4" />
                {pendingAmountOrders.length === 1
                  ? "1 заказ ожидает подтверждения суммы"
                  : `${pendingAmountOrders.length} заказа ожидают подтверждения суммы`}
              </div>
              {pendingAmountOrders.map(order => (
                <div key={order.id} className="flex items-center justify-between bg-white rounded-xl border border-amber-100 px-4 py-3">
                  <div>
                    <span className="font-medium text-foreground">#{order.id}</span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span className="text-foreground">{order.serviceType}</span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span className="text-amber-700 font-semibold">{fmt(Number((order as any).proposedAmount))}</span>
                    <span className="ml-2 text-xs text-muted-foreground">предложил мастер {order.masterName}</span>
                  </div>
                  {order.masterId && (
                    <button
                      onClick={() => openMasterChat(order.masterId!)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white hover:bg-amber-600 rounded-lg font-medium text-xs transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" />
                      Открыть чат
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50">
                  <tr>
                    <th className="px-6 py-4">ID заказа</th>
                    <th className="px-6 py-4">Локация</th>
                    <th className="px-6 py-4">Услуга / Объем</th>
                    <th className="px-6 py-4">Статус</th>
                    <th className="px-6 py-4">Мастер</th>
                    <th className="px-6 py-4">Сумма</th>
                    <th className="px-6 py-4 text-right">Рассылка</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                      </td>
                    </tr>
                  ) : orders?.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                        Заказов в буфере нет
                      </td>
                    </tr>
                  ) : orders?.map((order) => {
                    const ds = (order as any).dispatchStatus ?? "none";
                    const proposed = (order as any).proposedAmount ? Number((order as any).proposedAmount) : null;
                    const confirmed = (order as any).orderAmount ? Number((order as any).orderAmount) : null;
                    const pendingResp = pendingResponseOrders.find(p => p.orderId === order.id);
                    return (
                      <tr key={order.id} className={`hover:bg-slate-50/50 transition-colors ${proposed && !confirmed ? "bg-amber-50/30" : pendingResp ? "bg-blue-50/30" : ""}`}>
                        <td className="px-6 py-4">
                          <span className="font-medium text-foreground">#{order.id}</span>
                          <div className="text-xs text-muted-foreground mt-1">{formatDate(order.createdAt)}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 text-foreground font-medium">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                            {order.city}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">{order.district}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-foreground">{order.serviceType}</div>
                          <div className="text-xs text-muted-foreground mt-1">{order.area} м²</div>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={order.status} type="order" />
                        </td>
                        <td className="px-6 py-4">
                          {order.masterName ? (
                            <span className="font-medium">{order.masterName}</span>
                          ) : (
                            <span className="text-muted-foreground italic">Не назначен</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {confirmed ? (
                            <div>
                              <span className="font-semibold text-foreground">{fmt(confirmed)}</span>
                              {(order as any).commission && (
                                <div className="text-xs text-muted-foreground mt-0.5">ком. {fmt(Number((order as any).commission))}</div>
                              )}
                            </div>
                          ) : proposed ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
                                <DollarSign className="w-3 h-3" />Предложено
                              </span>
                              <div className="font-semibold text-amber-700">{fmt(proposed)}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <DispatchBadge status={ds} />
                            {order.status === OrderStatus.waiting_master && ds === "none" && (
                              <button
                                onClick={() => {
                                  setOpenDispatchId(order.id);
                                  broadcastMutation.reset();
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white hover:bg-blue-600 rounded-lg font-medium text-xs transition-colors"
                              >
                                <Send className="w-3 h-3" /> Разослать
                              </button>
                            )}
                            {ds === "dispatching" && (
                              <button
                                onClick={() => setOpenDispatchId(order.id)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs transition-colors ${pendingResp ? "bg-blue-500 text-white hover:bg-blue-600" : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"}`}
                              >
                                <Users className="w-3 h-3" />
                                {pendingResp ? `Отклики (${pendingResp.respondentCount})` : "Отклики"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Edit amount modal */}
        {editAmountId && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                <h2 className="font-display font-bold text-lg">Изменить сумму</h2>
                <button onClick={() => { setEditAmountId(null); setEditAmountValue(""); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Укажите итоговую стоимость заказа #{editAmountId}. Комиссия будет пересчитана автоматически.
                </p>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    value={editAmountValue}
                    onChange={e => setEditAmountValue(e.target.value)}
                    placeholder="Введите сумму..."
                    className="w-full pr-8 pl-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₽</span>
                </div>
                {setAmountMutation.isError && (
                  <p className="text-sm text-destructive">{(setAmountMutation.error as Error).message}</p>
                )}
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => { setEditAmountId(null); setEditAmountValue(""); }}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-slate-100"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => {
                      const amt = parseFloat(editAmountValue);
                      if (!isNaN(amt) && amt > 0 && editAmountId) {
                        setAmountMutation.mutate({ orderId: editAmountId, amount: amt });
                      }
                    }}
                    disabled={setAmountMutation.isPending || !editAmountValue || parseFloat(editAmountValue) <= 0}
                    className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                  >
                    {setAmountMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Сохранить
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dispatch Panel */}
        {openDispatchId && openOrder && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">

              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-display font-bold text-foreground">Рассылка заявки #{openDispatchId}</h2>
                  <p className="text-sm text-muted-foreground">{openOrder.serviceType} · {openOrder.city}, {openOrder.district}</p>
                </div>
                <button onClick={() => setOpenDispatchId(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="p-6 space-y-4">

                {((openOrder as any).dispatchStatus ?? "none") === "none" && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Заявка будет отправлена активным мастерам в городе <b>{openOrder.city}</b>. Телефон клиента скрыт — передаётся только после назначения.
                    </p>
                    {broadcastMutation.isError && (
                      <p className="text-sm text-red-500">{(broadcastMutation.error as Error).message}</p>
                    )}
                    {broadcastMutation.isSuccess && (
                      <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3 space-y-0.5">
                        <p>✅ Разослано: <b>{broadcastMutation.data?.sent}</b> мастеров</p>
                        {broadcastMutation.data?.skipped > 0 && (
                          <p className="text-muted-foreground text-xs">⏭ Пропущено {broadcastMutation.data.skipped} — достигли лимита заказов</p>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => broadcastMutation.mutate(openDispatchId)}
                      disabled={broadcastMutation.isPending || broadcastMutation.isSuccess}
                      className="w-full py-2.5 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {broadcastMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Разослать мастерам
                    </button>
                  </div>
                )}

                {((openOrder as any).dispatchStatus ?? "none") !== "none" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        Откликнулись ({respondents.length})
                      </p>
                      {dispatchLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                    </div>

                    {respondents.length === 0 ? (
                      <div className="text-center py-6 text-sm text-muted-foreground">
                        <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                        Ожидаем откликов от мастеров...
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {respondents.map(d => (
                          <div key={d.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                            <div>
                              <p className="text-sm font-medium text-foreground">{d.masterName}</p>
                              {d.respondedAt && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {new Date(d.respondedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              )}
                            </div>
                            {(openOrder as any).dispatchStatus !== "assigned" && (
                              <button
                                onClick={() => assignMutation.mutate({ orderId: openDispatchId, masterId: d.masterId })}
                                disabled={assignMutation.isPending}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white hover:bg-green-600 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
                              >
                                {assignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                                Назначить
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {(openOrder as any).dispatchStatus === "assigned" && (
                      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        Заявка назначена. Мастер получил контакт клиента.
                      </div>
                    )}

                    {(dispatchData?.dispatches.length ?? 0) > 0 && (
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground">Все получившие заявку ({dispatchData?.dispatches.length})</summary>
                        <div className="mt-2 space-y-1 pl-2 border-l border-border">
                          {dispatchData?.dispatches.map(d => (
                            <div key={d.id} className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                d.status === "assigned" ? "bg-green-500"
                                : d.status === "responded" ? "bg-blue-500"
                                : d.status === "rejected" ? "bg-red-400"
                                : "bg-gray-300"
                              }`} />
                              <button
                                onClick={() => { setOpenDispatchId(null); openMasterChat(d.masterId); }}
                                className="font-medium text-foreground hover:text-blue-600 hover:underline transition-colors text-left"
                              >
                                {d.masterName}
                              </button>
                              <span className="text-muted-foreground/60">
                                {d.status === "assigned" ? "назначен"
                                : d.status === "responded" ? "откликнулся"
                                : d.status === "rejected" ? "не выбран"
                                : "ожидает"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button onClick={() => setOpenDispatchId(null)} className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-slate-100 text-sm">
                    Закрыть
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
