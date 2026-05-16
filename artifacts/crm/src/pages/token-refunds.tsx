import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, CheckCircle2, XCircle, ExternalLink, RotateCcw, Filter } from "lucide-react";

interface RefundRequest {
  id: number;
  master_id: number;
  master_alias: string;
  order_id: number | null;
  tokens_amount: number;
  reason: string | null;
  status: string;
  created_at: string;
}

async function fetchRefunds(params: { status?: string; master_id?: number; page: number }) {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  qs.set("limit", "30");
  if (params.status) qs.set("status", params.status);
  if (params.master_id) qs.set("master_id", String(params.master_id));
  const r = await fetch(`/api/wallet/refunds?${qs}`, { credentials: "include" });
  if (!r.ok) throw new Error("Ошибка загрузки");
  return r.json() as Promise<RefundRequest[]>;
}

async function approveRefund(transactionId: number) {
  const r = await fetch(`/api/wallet/refund/${transactionId}/approve`, {
    method: "POST",
    credentials: "include",
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Ошибка");
  return data;
}

async function rejectRefund(transactionId: number, reason: string) {
  const r = await fetch(`/api/wallet/refund/${transactionId}/reject`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Ошибка");
  return data;
}

const statusBadge: Record<string, { label: string; className: string }> = {
  pending:   { label: "Ожидает",   className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  completed: { label: "Одобрен",   className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  cancelled: { label: "Отклонён",  className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

export default function TokenRefundsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [masterFilter, setMasterFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["token-refunds", statusFilter, masterFilter, page],
    queryFn: () => fetchRefunds({
      status: statusFilter || undefined,
      master_id: masterFilter ? Number(masterFilter) : undefined,
      page,
    }),
  });

  const approve = useMutation({
    mutationFn: approveRefund,
    onSuccess: (_, id) => {
      toast.success("Возврат одобрен");
      qc.invalidateQueries({ queryKey: ["token-refunds"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => rejectRefund(id, reason),
    onSuccess: () => {
      toast.success("Возврат отклонён");
      setRejectingId(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["token-refunds"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Coins size={24} className="text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold">Возвраты токенов</h1>
          <p className="text-sm text-muted-foreground">Арбитраж заявок на возврат от мастеров</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter size={16} className="text-muted-foreground" />
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 border border-border rounded-lg px-3 text-sm bg-background"
        >
          <option value="">Все статусы</option>
          <option value="pending">Ожидают</option>
          <option value="completed">Одобрены</option>
          <option value="cancelled">Отклонены</option>
        </select>
        <input
          type="number"
          placeholder="ID мастера"
          value={masterFilter}
          onChange={e => { setMasterFilter(e.target.value); setPage(1); }}
          className="h-9 w-36 border border-border rounded-lg px-3 text-sm bg-background"
        />
        {(statusFilter || masterFilter) && (
          <button
            onClick={() => { setStatusFilter(""); setMasterFilter(""); setPage(1); }}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Сбросить
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Дата</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Мастер</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Заявка</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Токены</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Причина</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Статус</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-muted-foreground">Загрузка...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-muted-foreground">Заявок нет</td>
              </tr>
            ) : rows.map(row => {
              const badge = statusBadge[row.status] ?? { label: row.status, className: "bg-gray-100 text-gray-600" };
              return (
                <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/masters?id=${row.master_id}`}
                      className="font-medium hover:underline text-primary flex items-center gap-1"
                      target="_blank" rel="noopener noreferrer"
                    >
                      {row.master_alias}
                      <ExternalLink size={11} />
                    </a>
                    <span className="text-xs text-muted-foreground">ID {row.master_id}</span>
                  </td>
                  <td className="px-4 py-3">
                    {row.order_id ? (
                      <a
                        href={`/orders?id=${row.order_id}`}
                        className="text-primary hover:underline flex items-center gap-1"
                        target="_blank" rel="noopener noreferrer"
                      >
                        #{row.order_id} <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 font-semibold text-amber-600">
                      <Coins size={13} /> {row.tokens_amount}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <p className="text-xs text-foreground line-clamp-2">{row.reason ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.status === "pending" ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => approve.mutate(row.id)}
                          disabled={approve.isPending}
                          title="Одобрить возврат"
                          className="flex items-center gap-1 h-8 px-3 rounded-lg bg-green-500 text-white text-xs font-semibold hover:bg-green-600 disabled:opacity-50"
                        >
                          <CheckCircle2 size={13} /> Одобрить
                        </button>
                        <button
                          onClick={() => { setRejectingId(row.id); setRejectReason(""); }}
                          title="Отклонить возврат"
                          className="flex items-center gap-1 h-8 px-3 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600"
                        >
                          <XCircle size={13} /> Отклонить
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
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
          className="h-9 px-4 rounded-lg border border-border text-sm disabled:opacity-40"
        >
          ← Назад
        </button>
        <span className="text-sm text-muted-foreground">Стр. {page}</span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={rows.length < 30}
          className="h-9 px-4 rounded-lg border border-border text-sm disabled:opacity-40"
        >
          Вперёд →
        </button>
      </div>

      {/* Reject modal */}
      {rejectingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center gap-2">
              <XCircle size={20} className="text-red-500" />
              <h3 className="font-bold text-lg">Отклонить возврат</h3>
            </div>
            <p className="text-sm text-muted-foreground">Укажите причину отклонения — она будет показана мастеру.</p>
            <textarea
              rows={3}
              placeholder="Причина отклонения..."
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background resize-none outline-none focus:ring-2 focus:ring-ring"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setRejectingId(null); setRejectReason(""); }}
                className="flex-1 h-11 rounded-xl border border-border text-sm font-medium"
              >
                Отмена
              </button>
              <button
                disabled={!rejectReason.trim() || reject.isPending}
                onClick={() => reject.mutate({ id: rejectingId, reason: rejectReason })}
                className="flex-1 h-11 rounded-xl bg-red-500 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {reject.isPending ? <RotateCcw size={15} className="animate-spin" /> : <XCircle size={15} />}
                Отклонить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
