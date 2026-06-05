import { ClipboardList, ArrowRight } from 'lucide-react';
import { formatRelativeTime, formatFullDate, formatCurrencyFull } from '../../utils/format';

interface Order {
  id: number;
  created_at: Date | string;
  city: string;
  client: string;
  master: string | null;
  service: string;
  amount: number | null;
  status: string;
  tokens_charged: number;
  payment_model: string;
  master_balance_after: number | null;
}

interface Props {
  data: Order[] | undefined;
  isLoading: boolean;
}

const statusConfig: Record<string, { label: string; bg: string; text: string; border?: string }> = {
  searching: { label: 'Ищем мастера', bg: '#EFF6FF', text: '#3B82F6' },
  on_site: { label: 'На замере', bg: '#FEF9C3', text: '#854D0E' },
  awaiting_estimate: { label: 'Ждём смету', bg: '#FFF7ED', text: '#C2410C' },
  awaiting_payment: { label: 'Ждём оплату', bg: '#F5F3FF', text: '#6D28D9' },
  in_progress: { label: 'В работе', bg: '#F0FFF8', text: '#166534' },
  completed: { label: 'Завершён', bg: '#F0FFF8', text: '#34C759', border: '#34C759' },
  problem: { label: 'Проблема', bg: '#FEF2F2', text: '#991B1B' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || { label: status, bg: '#F3F4F6', text: '#6B7280' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{
        backgroundColor: cfg.bg,
        color: cfg.text,
        border: cfg.border ? `1px solid ${cfg.border}` : undefined,
      }}
    >
      {cfg.label}
    </span>
  );
}

export function RecentOrders({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6">
        <div className="shimmer h-5 w-40 rounded mb-4" />
        <div className="space-y-3">
          {[0,1,2,3,4].map(i => <div key={i} className="shimmer h-10 rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 transition-all duration-200
      hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#34C759]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} color="#6B7280" />
          <span className="text-[14px] font-semibold text-[#111827]">Последние заказы</span>
          <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#E8F9EE] text-[#34C759]">
            {data.length} заказов
          </span>
        </div>
        <a href="/orders" className="flex items-center gap-1 text-[13px] font-medium text-[#34C759] hover:text-[#2aad4a] transition-colors">
          Все заказы
          <ArrowRight size={13} />
        </a>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['Номер', 'Время', 'Город', 'Клиент', 'Мастер', 'Услуга', 'Сумма', 'Токены', 'Модель', 'Статус'].map(h => (
                <th key={h} className="text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] pb-3 pr-3 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {data.map(order => (
              <tr
                key={order.id}
                className="hover:bg-[#F8F9FA] cursor-pointer transition-colors"
              >
                <td className="py-2.5 pr-3">
                  <span className="text-[13px] font-bold text-[#3B82F6] font-mono">#{order.id}</span>
                </td>
                <td className="py-2.5 pr-3">
                  <span
                    className="text-[12px] text-[#6B7280] whitespace-nowrap"
                    title={formatFullDate(order.created_at)}
                  >
                    {formatRelativeTime(order.created_at)}
                  </span>
                </td>
                <td className="py-2.5 pr-3">
                  <span className="text-[12px] text-[#6B7280] whitespace-nowrap">{order.city}</span>
                </td>
                <td className="py-2.5 pr-3">
                  <span className="text-[13px] text-[#374151] whitespace-nowrap">{order.client}</span>
                </td>
                <td className="py-2.5 pr-3">
                  <span className="text-[12px] text-[#6B7280] whitespace-nowrap">
                    {order.master || <span className="text-[#9CA3AF]">—</span>}
                  </span>
                </td>
                <td className="py-2.5 pr-3">
                  <span className="text-[12px] text-[#374151] whitespace-nowrap max-w-[100px] truncate block">
                    {order.service}
                  </span>
                </td>
                <td className="py-2.5 pr-3">
                  <span className="text-[13px] font-bold text-[#111827] whitespace-nowrap">
                    {order.amount ? formatCurrencyFull(order.amount) : <span className="text-[#9CA3AF] font-normal">—</span>}
                  </span>
                </td>
                <td className="py-2.5 pr-3">
                  <div className="flex flex-col whitespace-nowrap">
                    <span className="text-[12px] font-bold text-[#F59E0B]">{order.tokens_charged}</span>
                    {order.master_balance_after != null && (
                      <span className="text-[10px] text-[#9CA3AF]">баланс: {order.master_balance_after}</span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 pr-3">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                    order.payment_model === 'token' ? 'bg-[#E8F9EE] text-[#34C759]' : 'bg-[#EFF6FF] text-[#3B82F6]'
                  }`}>
                    {order.payment_model === 'token' ? 'Токен' : 'Комиссия'}
                  </span>
                </td>
                <td className="py-2.5">
                  <StatusBadge status={order.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
