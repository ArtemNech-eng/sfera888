import { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetTransactions, useGetFinanceSummary, useUpdateTransaction, TransactionPaymentStatus } from "@workspace/api-client-react";
import { ProtectedRoute } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Loader2, CheckCircle2, TrendingDown, TrendingUp, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Finance() {
  const queryClient = useQueryClient();
  const { data: summary } = useGetFinanceSummary();
  const { data: transactions, isLoading } = useGetTransactions();

  const updateMutation = useUpdateTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/finance/transactions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/finance/summary"] });
      }
    }
  });

  const handleMarkPaid = (id: number) => {
    updateMutation.mutate({ 
      id, 
      data: { paymentStatus: TransactionPaymentStatus.paid } 
    });
  };

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Финансы</h1>
            <p className="text-muted-foreground mt-1">Управление комиссиями и выплатами</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 text-white shadow-lg shadow-emerald-500/20">
              <div className="flex justify-between items-start mb-4">
                <p className="text-emerald-50 font-medium">Общий доход</p>
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm"><TrendingUp className="w-5 h-5 text-white" /></div>
              </div>
              <h2 className="text-3xl font-display font-bold">{formatCurrency(summary?.totalIncome || 0)}</h2>
            </div>
            
            <div className="bg-gradient-to-br from-destructive to-red-600 rounded-2xl p-6 text-white shadow-lg shadow-red-500/20">
              <div className="flex justify-between items-start mb-4">
                <p className="text-red-50 font-medium">Ожидает оплаты (Долг)</p>
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm"><TrendingDown className="w-5 h-5 text-white" /></div>
              </div>
              <h2 className="text-3xl font-display font-bold">{formatCurrency(summary?.totalDebt || 0)}</h2>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm">
              <p className="text-muted-foreground font-medium mb-4">Статистика транзакций</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-emerald-600 font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Оплачено</span>
                  <span className="font-bold">{summary?.paidCount || 0}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-amber-600 font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4"/> Ожидают</span>
                  <span className="font-bold">{summary?.pendingCount || 0}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-red-600 font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4"/> Просрочено</span>
                  <span className="font-bold">{summary?.overdueCount || 0}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border/50">
              <h3 className="font-display font-semibold text-lg">Последние транзакции</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50">
                  <tr>
                    <th className="px-6 py-4">ID / Дата</th>
                    <th className="px-6 py-4">Мастер</th>
                    <th className="px-6 py-4">Сумма заказа</th>
                    <th className="px-6 py-4">Комиссия (Долг)</th>
                    <th className="px-6 py-4">Статус</th>
                    <th className="px-6 py-4 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                      </td>
                    </tr>
                  ) : transactions?.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-medium text-foreground">TX-{tx.id}</span>
                        <div className="text-xs text-muted-foreground mt-1">{formatDate(tx.createdAt)}</div>
                      </td>
                      <td className="px-6 py-4 font-medium">{tx.masterAlias}</td>
                      <td className="px-6 py-4">{formatCurrency(tx.orderAmount)}</td>
                      <td className="px-6 py-4 font-bold text-foreground">{formatCurrency(tx.commission)}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={tx.paymentStatus} type="payment" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        {(tx.paymentStatus === TransactionPaymentStatus.pending || tx.paymentStatus === TransactionPaymentStatus.overdue) && (
                          <button
                            onClick={() => handleMarkPaid(tx.id)}
                            disabled={updateMutation.isPending}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg font-medium text-xs transition-colors"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Оплачено
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
