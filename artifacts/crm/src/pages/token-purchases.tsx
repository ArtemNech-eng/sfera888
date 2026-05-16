import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Coins, CheckCircle2, XCircle, ExternalLink, Wallet, Filter, Loader2,
} from "lucide-react";

interface PurchaseRequest {
  id: number;
  master_id: number;
  master_alias: string;
  master_city: string;
  package_id: number | null;
  package_name: string;
  tokens_amount: number;
  rub_amount: number | null;
  reason: string | null;
  status: string;
  created_at: string;
}

async function fetchPurchases(params: {
  status?: string;
  master_id?: number;
  page: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  qs.set("limit", String(params.limit ?? 30));
  if (params.status) qs.set("status", params.status);
  if (params.master_id) qs.set("master_id", String(params.master_id));
  const r = await fetch(`/api/wallet/purchases?${qs}`, { credentials: "include" });
  if (!r.ok) throw new Error("Ошибка загрузки");
  return r.json() as Promise<PurchaseRequest[]>;
}

async function confirmPurchase(masterId: number, transactionId: number) {
  const r = await fetch(`/api/wallet/${masterId}/confirm-purchase`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction_id: transactionId }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Ошибка подтверждения");
  return data;
}

async function cancelPurchase(masterId: number, transactionId: number, reason: string) {
  const r = await fetch(`/api/wallet/${masterId}/cancel-purchase`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction_id: transactionId, reason }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Ошибка отклонения");
  return data;
}

const statusBadge: Record<string, { label: string; className: string }> = {
  pending: { label: "Ожидает", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  completed: { label: "Подтвержден", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  cancelled: { label: "Отклонён", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

export default function TokenPurchasesPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [masterFilter, setMasterFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingMasterId, setRejectingMasterId] = useState<number | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["token-purchases", statusFilter, masterFilter, page],
    queryFn: () => fetchPurchases({
      status: statusFilter || undefined,
      master_id: masterFilter ? Number(masterFilter) : undefined,
      page,
    }),
  });

  const confirm = useMutation({
    mutationFn: ({ masterId, id }: { masterId: number; id: number }) => confirmPurchase(masterId, id),
    onSuccess: (_, vars) => {
      toast.success(`Пополнение подтверждено: ${vars.id}`);
      qc.invalidateQueries({ queryKey: ["token-purchases"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: ({ masterId, id, reason }: { masterId: number; id: number; reason: string }) =>
      cancelPurchase(masterId, id, reason),
    onSuccess: () => {
      toast.success("Пополнение отклонено");
      setRejectingId(null);
      setRejectReason("");
      setRejectingMasterId(null);
      qc.invalidateQueries({ queryKey: ["token-purchases"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openReject = (id: number, masterId: number) => {
    setRejectingId(id);
    setRejectingMasterId(masterId);
    setRejectReason("");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Wallet size={24} className="text-green-600" />
        <div>
          <h1 className="text-2xl font-bold">Пополнения токенов</h1>
          <p className="text-sm text-muted-foreground">Подтверждение покупок пакетов мастерами</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-card rounded-xl border p-3">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Фильтры:</span>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="text-sm border rounded-lg px-3 py-1.5 bg-background"
        >
          <option value="">Все статусы</option>
          <option value="pending">Ожидают</option>
          <option value="completed">Подтверждены</option>
          <option value="cancelled">Отклонены</option>
        </select>
        <input
          type="text"
          placeholder="ID мастера..."
          value={masterFilter}
          onChange={(e) => { setMasterFilter(e.target.value); setPage(1); }}
          className="text-sm border rounded-lg px-3 py-1.5 w-32 bg-background"
        />
        <button
          onClick={() => { setStatusFilter("pending"); setMasterFilter(""); setPage(1); }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Сбросить
        </button>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-xs font-semibold text-muted-foreground uppercase">
              <th className="px-4 py-3">Дата</th>
              <th className="px-4 py-3">Мастер</th>
              <th className="px-4 py-3">Пакет</th>
              <th className="px-4 py-3 text-right">Токенов</th>
              <th className="px-4 py-3 text-right">Сумма</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Нет заявок на пополнение
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const cfg = statusBadge[r.status] ?? { label: r.status, className: "bg-gray-100 text-gray-700" };
              const canAct = r.status === "pending";
              return (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("ru-RU", {
                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.master_alias}</div>
                    <div className="text-xs text-muted-foreground">{r.master_city || "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1">
                      <Coins size={14} className="text-amber-500" />
                      {r.package_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{r.tokens_amount} т.</td>
                  <td className="px-4 py-3 text-right">{r.rub_amount?.toLocaleString("ru-RU") ?? "—"} ₽</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${cfg.className}`}>
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canAct ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => confirm.mutate({ masterId: r.master_id, id: r.id })}
                          disabled={confirm.isPending}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600 disabled:opacity-50"
                        >
                          {confirm.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          Подтвердить
                        </button>
                        <button
                          onClick={() => openReject(r.id, r.master_id)}
                          disabled={confirm.isPending}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-red-50 text-red-600 disabled:opacity-50"
                        >
                          <XCircle size={12} />
                          Отклонить
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50 hover:bg-muted"
        >
          ← Назад
        </button>
        <span className="text-sm text-muted-foreground">Страница {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={rows.length < 30}
          className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50 hover:bg-muted"
        >
          Вперёд →
        </button>
      </div>

      {/* Reject Modal */}
      {rejectingId && rejectingMasterId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold text-lg">Отклонить пополнение</h3>
            <p className="text-sm text-muted-foreground">
              Укажите причину отклонения. Мастер получит уведомление.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Причина отклонения..."
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRejectingId(null)}
                className="flex-1 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted"
              >
                Отмена
              </button>
              <button
                onClick={() =>
                  reject.mutate({ masterId: rejectingMasterId, id: rejectingId, reason: rejectReason })
                }
                disabled={!rejectReason.trim() || reject.isPending}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {reject.isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Отклонить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
