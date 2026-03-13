import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useGetSalesFunnel } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Loader2 } from "lucide-react";

export default function Analytics() {
  const { data: funnel, isLoading } = useGetSalesFunnel();

  const data = funnel ? [
    { name: 'Всего заявок', value: funnel.total, color: '#3b82f6' }, // blue-500
    { name: 'В обработке', value: funnel.processing, color: '#f59e0b' }, // amber-500
    { name: 'В работе', value: funnel.sentToWork, color: '#10b981' }, // emerald-500
    { name: 'Завершено', value: funnel.completed, color: '#059669' }, // emerald-600
    { name: 'Отказ', value: funnel.refusal, color: '#ef4444' }, // red-500
    { name: 'Нецелевые', value: funnel.nonTarget, color: '#64748b' }, // slate-500
  ] : [];

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Аналитика</h1>
            <p className="text-muted-foreground mt-1">Детальные отчеты и воронка продаж</p>
          </div>

          <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-6">
            <h3 className="font-display font-semibold text-lg mb-6">Воронка продаж</h3>
            {isLoading ? (
              <div className="h-[400px] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                    <Tooltip 
                      cursor={{fill: '#f8fafc'}}
                      contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
