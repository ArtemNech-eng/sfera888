import { Shield, CheckCircle, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

interface RiskOrder {
  id: number;
  master: string;
  city: string;
  risk_level: 'critical' | 'warning';
  risk_reason: string;
  expected_commission: number;
}

interface RiskData {
  critical_count: number;
  warning_count: number;
  total_at_risk: number;
  orders: RiskOrder[];
}

interface Props {
  data: RiskData | undefined;
  isLoading: boolean;
}

export function RiskMonitor({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6">
        <div className="shimmer h-5 w-36 rounded mb-4" />
        <div className="space-y-3">
          {[0,1,2,3].map(i => <div key={i} className="shimmer h-12 rounded" />)}
        </div>
      </div>
    );
  }

  const hasRisks = data.critical_count > 0 || data.warning_count > 0;
  const shieldColor = data.critical_count > 0 ? '#EF4444' : data.warning_count > 0 ? '#F59E0B' : '#34C759';

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 transition-all duration-200
      hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#34C759]">
      <div className="flex items-center gap-2 mb-5">
        <Shield size={18} color={shieldColor} />
        <span className="text-[14px] font-semibold text-[#111827]">Риск-монитор</span>
      </div>

      {!hasRisks ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2 bg-[#F0FFF8] rounded-xl">
          <CheckCircle size={24} color="#34C759" />
          <span className="text-[14px] font-medium text-[#166534]">Все заказы в порядке</span>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-[#FEF2F2] rounded-xl p-3 text-center">
              <div className="text-[22px] font-bold text-[#EF4444]">{data.critical_count}</div>
              <div className="text-[11px] text-[#6B7280] mt-0.5">Критичных</div>
            </div>
            <div className="bg-[#FFFBEB] rounded-xl p-3 text-center">
              <div className="text-[22px] font-bold text-[#F59E0B]">{data.warning_count}</div>
              <div className="text-[11px] text-[#6B7280] mt-0.5">Внимания</div>
            </div>
            <div className="bg-[#F0FFF8] rounded-xl p-3 text-center">
              <div className="text-[16px] font-bold text-[#34C759]">{formatCurrency(data.total_at_risk)}</div>
              <div className="text-[11px] text-[#6B7280] mt-0.5">Под угрозой</div>
            </div>
          </div>

          {/* Risk orders list */}
          <div className="space-y-1">
            {data.orders.slice(0, 5).map(order => {
              const isCritical = order.risk_level === 'critical';
              const borderColor = isCritical ? '#EF4444' : '#F59E0B';
              const textColor = isCritical ? 'text-[#991B1B]' : 'text-[#92400E]';
              return (
                <div
                  key={order.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#F8F9FA] cursor-pointer transition-colors"
                >
                  <div className="w-[3px] h-10 rounded-full flex-shrink-0" style={{ backgroundColor: borderColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-[#3B82F6]">#{order.id}</span>
                      <span className="text-[12px] text-[#6B7280] truncate">{order.master} · {order.city}</span>
                    </div>
                    <span className={`text-[12px] font-medium ${textColor}`}>{order.risk_reason}</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[12px] font-semibold text-[#34C759]">{formatCurrency(order.expected_commission)}</div>
                  </div>
                  <ChevronRight size={14} color="#D1D5DB" />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
