import { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetOrders, useAssignMaster, useGetMasters, OrderStatus } from "@workspace/api-client-react";
import { ProtectedRoute } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import { Loader2, UserPlus, MapPin, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Orders() {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedMasterId, setSelectedMasterId] = useState<number | string>("");
  
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useGetOrders({}, { query: { refetchInterval: 10000 } });
  const { data: masters } = useGetMasters();

  const assignMutation = useAssignMaster({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        setSelectedOrderId(null);
        setSelectedMasterId("");
      }
    }
  });

  const handleAssign = () => {
    if (selectedOrderId && selectedMasterId) {
      assignMutation.mutate({ 
        id: selectedOrderId, 
        data: { masterId: Number(selectedMasterId) } 
      });
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'master_operator']}>
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Буфер заказов</h1>
            <p className="text-muted-foreground mt-1">Распределение заказов по мастерам</p>
          </div>

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
                  ) : orders?.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                        Заказов в буфере нет
                      </td>
                    </tr>
                  ) : orders?.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
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
                      <td className="px-6 py-4 text-right">
                        {order.status === OrderStatus.waiting_master && (
                          <button
                            onClick={() => setSelectedOrderId(order.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground rounded-lg font-medium text-xs transition-colors"
                          >
                            <UserPlus className="w-3 h-3" /> Назначить
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

        {/* Assign Modal */}
        {selectedOrderId && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-border/50">
                <h2 className="text-lg font-display font-bold text-foreground">Назначить мастера</h2>
                <p className="text-sm text-muted-foreground">Заказ #{selectedOrderId}</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Выберите мастера</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3.5 text-muted-foreground" />
                    <select 
                      value={selectedMasterId}
                      onChange={e => setSelectedMasterId(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background appearance-none"
                    >
                      <option value="">Не выбран</option>
                      {masters?.filter(m => m.status === 'active').map(m => (
                        <option key={m.id} value={m.id}>
                          {m.alias} • {m.city} • ★ {m.rating}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button onClick={() => setSelectedOrderId(null)} className="px-4 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-slate-100">
                    Отмена
                  </button>
                  <button 
                    onClick={handleAssign}
                    disabled={!selectedMasterId || assignMutation.isPending} 
                    className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50"
                  >
                    {assignMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Назначить
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
