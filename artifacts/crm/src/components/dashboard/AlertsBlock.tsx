import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';

interface Alert {
  id: number;
  type: 'critical' | 'warning';
  text: string;
  count: number;
  link: string;
}

interface Props {
  alerts: Alert[];
}

export function AlertsBlock({ alerts }: Props) {
  const [, navigate] = useLocation();
  if (!alerts || alerts.length === 0) return null;

  const hasCritical = alerts.some(a => a.type === 'critical');

  return (
    <div
      className={`rounded-xl px-5 py-3 flex items-center gap-4 flex-wrap animate-slide-down border
        ${hasCritical
          ? 'bg-[#FEF2F2] border-[#FECACA]'
          : 'bg-[#FFFBEB] border-[#FDE68A]'}`}
    >
      <div className="flex items-center gap-2 flex-shrink-0">
        <AlertTriangle size={16} color={hasCritical ? '#EF4444' : '#F59E0B'} />
        <span className="text-[13px] font-semibold text-[#111827]">Требует внимания:</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap flex-1">
        {alerts.map(alert => (
          <button
            key={alert.id}
            onClick={() => navigate(alert.link)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium
              transition-all cursor-pointer border
              ${alert.type === 'critical'
                ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B] hover:bg-[#FEE2E2]'
                : 'bg-[#FFFBEB] border-[#FDE68A] text-[#854D0E] hover:bg-[#FEF3C7]'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${alert.type === 'critical' ? 'bg-[#EF4444]' : 'bg-[#F59E0B]'}`} />
            {alert.text}
            {alert.count > 1 && (
              <span className="font-bold ml-0.5">{alert.count}</span>
            )}
          </button>
        ))}
      </div>

      <button
        onClick={() => {
          // Если есть критичный алерт с конкретной ссылкой — идём туда,
          // иначе на страницу заказов
          const critical = alerts.find(a => a.type === 'critical');
          const target = critical?.link ?? alerts[0]?.link ?? '/orders';
          navigate(target);
        }}
        className="flex items-center gap-1 text-[12px] font-medium text-[#6B7280] hover:text-[#111827] transition-colors flex-shrink-0"
      >
        Все проблемы
        <ArrowRight size={13} />
      </button>
    </div>
  );
}
