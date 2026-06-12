import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Coins, AlertTriangle, CheckCircle2, Loader2, Plus, Trash2, Play } from "lucide-react";

/**
 * Admin-only page for the remove-token-payment-model migration prep.
 *
 * Workflow (Phase A → Phase B):
 *  1. Admin opens this page after Phase A flip is stable for 7+ days.
 *  2. Sees list of masters with positive `tokensBalance` (≈2 by D1).
 *  3. Creates a `master_balance_grants` row for each: amount + reason.
 *  4. Runs dry-run to verify preflight is clean.
 *  5. Then runs `pnpm tsx scripts/src/migrate-remove-tokens.ts apply`
 *     from CLI (admin via Railway). This page doesn't apply migration —
 *     too risky for a single click button.
 */

interface MasterRow {
  id: number;
  alias: string;
  city: string;
  tokensBalance: number;
  creditTokensIssued: number;
  totalRubSpent: number;
  suggestedGrant: number | null;
  activeOrdersCount: number;
  existingGrant: { id: number; amount: number; reason: string | null; appliedAt: string | null } | null;
}

interface DryRunResult {
  preflight: {
    pendingRefundsCount: number;
    mastersWithBalanceCount: number;
    mastersWithoutGrantCount: number;
    openTokenOrdersCount: number;
  };
  willApply: {
    refundsToApprove: number;
    creditLimitsToSet: number;
    grantsToApply: number;
    ordersToCancel: number;
  };
  errors: string[];
  ok: boolean;
}

export default function TokenMigrationAdminPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ masters: MasterRow[] }>({
    queryKey: ["/api/admin/token-migration/masters-with-balance"],
    queryFn: async () => {
      const r = await fetch("/api/admin/token-migration/masters-with-balance", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch");
      return r.json();
    },
  });

  const [editing, setEditing] = useState<{ masterId: number; amount: string; reason: string } | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);

  const saveGrant = useMutation({
    mutationFn: async (body: { masterId: number; amount: number; reason: string }) => {
      const r = await fetch("/api/admin/token-migration/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Не удалось сохранить grant");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/token-migration/masters-with-balance"] });
      setEditing(null);
      toast({ title: "Grant сохранён" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteGrant = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/admin/token-migration/grants/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Ошибка");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/token-migration/masters-with-balance"] });
      toast({ title: "Grant удалён" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const dryRun = useMutation({
    mutationFn: async (): Promise<DryRunResult> => {
      const r = await fetch("/api/admin/token-migration/dry-run", {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Не удалось запустить dry-run");
      return r.json();
    },
    onSuccess: (data) => {
      setDryRunResult(data);
      toast({ title: data.ok ? "Dry-run чистый" : "Dry-run есть errors" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const masters = data?.masters ?? [];

  return (
    <ProtectedRoute allowedRoles={["admin"]} permissionKey="settings">
      <Layout>
        <div className="max-w-4xl mx-auto space-y-6 p-6">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-2">
              <Coins className="text-amber-600" /> Token migration prep
            </h1>
            <p className="text-muted-foreground mt-1">
              Подготовка к Phase B миграции (.kiro/specs/remove-token-payment-model). Создай grants для мастеров
              с положительным tokensBalance, запусти dry-run, потом из CLI apply.
            </p>
          </div>

          {/* Dry-run result */}
          {dryRunResult && (
            <div className={`rounded-2xl border-2 p-4 space-y-2 ${
              dryRunResult.ok ? "bg-emerald-50 border-emerald-300" : "bg-red-50 border-red-300"
            }`}>
              <div className="flex items-center gap-2 font-semibold">
                {dryRunResult.ok ? (
                  <CheckCircle2 className="text-emerald-700" />
                ) : (
                  <AlertTriangle className="text-red-700" />
                )}
                {dryRunResult.ok ? "Готов к apply" : "Есть проблемы — почини перед apply"}
              </div>
              {dryRunResult.errors.length > 0 && (
                <ul className="text-sm text-red-800 list-disc list-inside">
                  {dryRunResult.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Refunds to auto-approve</p>
                  <p className="text-2xl font-bold">{dryRunResult.willApply.refundsToApprove}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Credit limits to set (1500₽)</p>
                  <p className="text-2xl font-bold">{dryRunResult.willApply.creditLimitsToSet}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Grants to apply</p>
                  <p className="text-2xl font-bold">{dryRunResult.willApply.grantsToApply}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Token-orders to cancel</p>
                  <p className="text-2xl font-bold">{dryRunResult.willApply.ordersToCancel}</p>
                </div>
              </div>
            </div>
          )}

          {/* Run buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => dryRun.mutate()}
              disabled={dryRun.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {dryRun.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Запустить dry-run
            </button>
            <p className="text-xs text-muted-foreground">
              Apply делается из CLI: <code className="bg-slate-100 px-1.5 py-0.5 rounded">pnpm tsx scripts/src/migrate-remove-tokens.ts apply</code>
            </p>
          </div>

          {/* Masters list */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
              <h2 className="font-semibold">Мастера с положительным tokensBalance</h2>
              <span className="text-xs text-muted-foreground">{masters.length} мастер(ов)</span>
            </div>

            {isLoading ? (
              <div className="p-8 flex items-center justify-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Загружаю…
              </div>
            ) : masters.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Все мастера уже на нуле. Можно запускать migration apply (из CLI).
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="px-4 py-2 text-left">Мастер</th>
                    <th className="px-4 py-2 text-right">Tokens</th>
                    <th className="px-4 py-2 text-right">Credit</th>
                    <th className="px-4 py-2 text-right">Active</th>
                    <th className="px-4 py-2 text-left">Grant</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {masters.map((m) => (
                    <tr key={m.id} className="border-b border-border/50 hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{m.alias}</div>
                        <div className="text-xs text-muted-foreground">{m.city}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{m.tokensBalance}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{m.creditTokensIssued}</td>
                      <td className="px-4 py-2.5 text-right">{m.activeOrdersCount}</td>
                      <td className="px-4 py-2.5">
                        {m.existingGrant ? (
                          <div className="text-xs space-y-0.5">
                            <div className="font-semibold">
                              {m.existingGrant.amount.toLocaleString("ru-RU")} ₽
                              {m.existingGrant.appliedAt && (
                                <span className="ml-1 text-emerald-700">✓ applied</span>
                              )}
                            </div>
                            {m.existingGrant.reason && (
                              <div className="text-muted-foreground italic">«{m.existingGrant.reason}»</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-amber-600">не задан</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1.5 justify-end">
                          {!m.existingGrant?.appliedAt && (
                            <button
                              onClick={() =>
                                setEditing({
                                  masterId: m.id,
                                  amount: m.existingGrant ? String(m.existingGrant.amount) : "",
                                  reason: m.existingGrant?.reason ?? "",
                                })
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-md text-xs hover:bg-blue-100"
                            >
                              <Plus className="w-3 h-3" />
                              {m.existingGrant ? "Edit" : "Add"}
                            </button>
                          )}
                          {m.existingGrant && !m.existingGrant.appliedAt && (
                            <button
                              onClick={() => {
                                if (confirm(`Удалить grant для ${m.alias}?`)) {
                                  deleteGrant.mutate(m.existingGrant!.id);
                                }
                              }}
                              disabled={deleteGrant.isPending}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs hover:bg-red-100 disabled:opacity-50"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Edit dialog */}
          {editing && (
            <div
              className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
              onClick={() => setEditing(null)}
            >
              <div
                className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-3"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="font-bold text-lg">
                  Grant для master #{editing.masterId}
                </h3>
                <label className="block">
                  <span className="text-xs text-muted-foreground">Сумма, ₽</span>
                  <input
                    type="number"
                    value={editing.amount}
                    onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                    placeholder="0"
                    autoFocus
                    className="mt-1 w-full px-3 py-2 border border-border rounded-xl"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground">Reason (обязательно)</span>
                  <textarea
                    value={editing.reason}
                    onChange={(e) => setEditing({ ...editing, reason: e.target.value })}
                    placeholder="Например: конверсия 100 токенов по 50₽ + бонус"
                    rows={3}
                    className="mt-1 w-full px-3 py-2 border border-border rounded-xl resize-none"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const amountNum = parseFloat(editing.amount);
                      if (!isFinite(amountNum) || amountNum <= 0) {
                        toast({ title: "Сумма должна быть > 0", variant: "destructive" });
                        return;
                      }
                      if (!editing.reason.trim()) {
                        toast({ title: "Reason обязательно", variant: "destructive" });
                        return;
                      }
                      saveGrant.mutate({
                        masterId: editing.masterId,
                        amount: amountNum,
                        reason: editing.reason.trim(),
                      });
                    }}
                    disabled={saveGrant.isPending}
                    className="flex-1 px-4 py-2 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saveGrant.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Сохранить"}
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="px-4 py-2 bg-white border border-border rounded-xl text-muted-foreground"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
